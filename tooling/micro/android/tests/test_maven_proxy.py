import hashlib
import importlib.util
import io
import json
import http.client
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('maven_proxy', Path(__file__).resolve().parents[1] / 'maven_proxy.py')
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)
PATH = '/central/org/example/module/1.0/module-1.0.pom'
URL = 'https://repo.maven.apache.org/maven2/org/example/module/1.0/module-1.0.pom'


class Response(io.BytesIO):
    def __init__(self, data=b'fixture', length=None):
        super().__init__(data)
        self.url = URL; self.status = 200
        self.headers = {'Content-Length': str(len(data) if length is None else length)}


class Opener:
    def __init__(self, data=b'fixture', length=None):
        self.data = data; self.length = length; self.calls = 0

    def open(self, request, timeout):
        self.calls += 1
        if request.full_url != URL or timeout != 30:
            raise AssertionError('Unexpected fixture upstream request')
        if request.has_header('Authorization') or request.has_header('Cookie'):
            raise AssertionError('Credential forwarded')
        return Response(self.data, self.length)


class ProxyTests(unittest.TestCase):
    def test_public_coordinate_mapping_and_rejected_authorities(self):
        self.assertEqual(proxy.path_url(PATH), URL)
        for path in ('https://example.com/a.jar', '/central/../secret.jar', '/central/org/%2e%2e/a.jar', '/central//a.jar', '/private/org/a.jar', PATH+'?token=secret', PATH+'#fragment', '/central/org/module/1-SNAPSHOT/module.jar', '/central/org/module/1/source.sh', '/central/org/module/LATEST/module.jar', '/central/org/module/RELEASE/module.jar', '/central/org/module/maven-metadata.xml', '/central/org/module/maven-metadata.xml.sha1'):
            with self.subTest(path=path), self.assertRaises(ValueError): proxy.path_url(path)

    def test_redirects_cannot_change_coordinate_scheme_or_origin_policy(self):
        artifact = 'org/example/module/1.0/module-1.0.pom'
        proxy.check_upstream(URL, artifact)
        proxy.check_upstream('https://plugins-artifacts.gradle.org/'+artifact, artifact)
        for url in ('http://repo.maven.apache.org/maven2/'+artifact, 'https://repo.maven.apache.org.evil.test/maven2/'+artifact, 'https://secret@repo.maven.apache.org/maven2/'+artifact, URL+'?token=secret', URL.replace('module-1.0.pom', 'other.jar'), URL.replace('/org/', '/org/../'), URL.replace('apache.org', 'apache.org:444')):
            with self.subTest(url=url), self.assertRaises(ValueError): proxy.check_upstream(url, artifact)

    def test_plugin_cdn_mapping_keeps_exact_logical_coordinate_and_hash(self):
        artifact = 'org/gradle/toolchains/foojay-resolver/1.0.0/foojay-resolver-1.0.0.pom'
        digest = '9bc48b49e422d9edabc396ac18d8b041dfc22212d7fae8e35667d285d481029a'
        url = 'https://plugins-artifacts.gradle.org/org.gradle.toolchains/foojay-resolver/1.0.0/'+digest+'/foojay-resolver-1.0.0.pom'
        self.assertEqual(proxy.check_upstream(url, artifact), digest)
        for bad in (url.replace('org.gradle.toolchains', 'org.other.toolchains'), url.replace('/1.0.0/', '/2.0.0/'), url.replace(digest, 'short'), url.replace('.pom', '.jar'), url+'?credential=synthetic'):
            with self.subTest(url=bad), self.assertRaises(ValueError): proxy.check_upstream(bad, artifact)

    def test_publisher_cache_requires_central_origin_and_exact_release_artifact(self):
        for artifact, checksum in proxy.REACT_NATIVE_ARTIFACTS.items():
            origin = proxy.REPOSITORIES['central']+artifact
            mirror = proxy.REACT_NATIVE_MIRROR+artifact
            self.assertEqual(proxy.check_upstream(mirror, artifact, origin), checksum)
            for bad_origin in (None, proxy.REPOSITORIES['google']+artifact, origin+'?token=fixture'):
                with self.subTest(artifact=artifact, origin=bad_origin), self.assertRaises(ValueError):
                    proxy.check_upstream(mirror, artifact, bad_origin)
            for bad in (mirror.replace('-release.aar', '-debug.aar'), mirror+'?token=fixture', mirror.replace('repo.reactnative.dev', 'repo.reactnative.dev.evil.test'), mirror.replace('/maven2/', '/other/'), mirror.replace('https:', 'http:'), mirror.replace('/0.86.3/', '/9.9.9/')):
                if bad == mirror: continue
                with self.subTest(url=bad), self.assertRaises(ValueError): proxy.check_upstream(bad, artifact, origin)
        for artifact in ('com/facebook/react/react-android/0.86.3/maven-metadata.xml', 'org/example/module/1.0/module-1.0.aar', 'com/facebook/react/react-android/0.86.3/react-android-0.86.3.pom', 'com/facebook/react/react-android/0.86.3/react-android-0.86.3-release.aar.sha256'):
            with self.subTest(artifact=artifact), self.assertRaises(ValueError):
                proxy.check_upstream(proxy.REACT_NATIVE_MIRROR+artifact, artifact, proxy.REPOSITORIES['central']+artifact)

    def test_publisher_redirect_bytes_require_independent_published_checksum(self):
        artifact = 'com/facebook/react/react-android/0.86.3/react-android-0.86.3-release.aar'
        for correct in (True, False):
            with tempfile.TemporaryDirectory() as temp:
                data=b'native fixture';checksum=hashlib.sha256(data).hexdigest()
                response=Response(data);response.url=proxy.REACT_NATIVE_MIRROR+artifact
                opener=Opener();cache=proxy.Cache(Path(temp))
                with patch.dict(proxy.REACT_NATIVE_ARTIFACTS,{artifact:checksum if correct else '0'*64}), patch.object(opener,'open',return_value=response), patch.object(proxy,'build_opener',return_value=opener):
                    if correct:
                        _,receipt=cache.fetch('/central/'+artifact)
                        self.assertEqual(receipt['publisherSha256'],checksum)
                        self.assertIsNone(receipt['redirectPathSha256'])
                        self.assertEqual(receipt['finalUrl'],response.url)
                    else:
                        with self.assertRaisesRegex(ValueError,'hash mismatch'):cache.fetch('/central/'+artifact)
                        self.assertFalse(cache.items)
                        self.assertFalse(list(Path(temp).glob('*.blob')))

    def test_other_allowed_repository_cannot_override_published_native_pin(self):
        artifact = 'com/facebook/react/react-android/0.86.3/react-android-0.86.3-release.aar'
        origin = proxy.REPOSITORIES['central']+artifact
        data=b'independent wrong pinned body';checksum=hashlib.sha256(data).hexdigest()
        cdn='https://plugins-artifacts.gradle.org/com.facebook.react/react-android/0.86.3/'+checksum+'/react-android-0.86.3-release.aar'
        for destination in (cdn, proxy.REPOSITORIES['google']+artifact):
            with self.subTest(destination=destination), self.assertRaisesRegex(ValueError,'not its publisher'):
                proxy.check_upstream(destination,artifact,origin)
            with tempfile.TemporaryDirectory() as temp:
                cache=proxy.Cache(Path(temp));response=Response(data);response.url=destination
                with patch.object(proxy,'build_opener') as opener:
                    opener.return_value.open.return_value=response
                    with self.assertRaisesRegex(ValueError,'not its publisher'):cache.fetch('/central/'+artifact)
                self.assertFalse(cache.items)
                self.assertFalse(list(Path(temp).glob('*.blob')))

    def test_cdn_hash_mismatch_cannot_publish_a_download(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = proxy.Cache(Path(temp))
            response = Response()
            response.url = 'https://plugins-artifacts.gradle.org/org.example/module/1.0/'+'0'*64+'/module-1.0.pom'
            opener = Opener()
            with patch.object(opener, 'open', return_value=response), patch.object(proxy, 'build_opener', return_value=opener):
                with self.assertRaisesRegex(ValueError, 'hash mismatch'): cache.fetch(PATH)
            self.assertFalse(cache.items)
            self.assertFalse(list(Path(temp).glob('*.blob')))
            self.assertTrue(list(Path(temp).glob('*.partial')))

    def test_acquired_bytes_are_hashed_retained_and_cached(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = proxy.Cache(Path(temp)); opener = Opener()
            with patch.object(proxy, 'build_opener', return_value=opener):
                path, receipt = cache.fetch(PATH)
                second, second_receipt = cache.fetch(PATH)
            self.assertEqual(opener.calls, 1)
            self.assertEqual(path.read_bytes(), b'fixture')
            self.assertEqual(receipt['sha256'], hashlib.sha256(b'fixture').hexdigest())
            self.assertEqual((second, second_receipt), (path, receipt))
            event = json.loads((Path(temp)/'events.jsonl').read_text())
            self.assertEqual(event['action'], 'artifact-acquired')

    def test_cache_tamper_is_rejected_without_upstream_fallback(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = proxy.Cache(Path(temp)); opener = Opener()
            with patch.object(proxy, 'build_opener', return_value=opener):
                path, _ = cache.fetch(PATH); path.write_bytes(b'changed')
                with self.assertRaisesRegex(ValueError, 'integrity'): cache.fetch(PATH)
            self.assertEqual(opener.calls, 1)

    def test_missing_bytes_do_not_create_a_successful_artifact_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = proxy.Cache(Path(temp))
            with patch.object(proxy, 'build_opener', return_value=Opener(b'four', 8)), self.assertRaisesRegex(ValueError, 'Truncated'):
                cache.fetch(PATH)
            event = json.loads((Path(temp)/'events.jsonl').read_text())
            self.assertEqual(event['action'], 'artifact-failed')
            self.assertEqual(list(Path(temp).glob('*.blob')), [])
            self.assertEqual(len(list(Path(temp).glob('*.partial'))), 1)

    def test_declared_and_total_byte_limits_fail_without_success(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = proxy.Cache(Path(temp))
            with patch.object(proxy, 'ARTIFACT_BYTES', 3), patch.object(proxy, 'build_opener', return_value=Opener(b'four')), self.assertRaisesRegex(ValueError, 'declared'):
                cache.fetch(PATH)
            with patch.object(proxy, 'TOTAL_BYTES', 3), patch.object(proxy, 'build_opener', return_value=Opener(b'four')), self.assertRaisesRegex(ValueError, 'total'):
                cache.fetch(PATH)
            self.assertEqual(list(Path(temp).glob('*.blob')), [])
            self.assertFalse(cache.items)

    def test_invalid_requests_count_toward_the_request_budget(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = proxy.Cache(Path(temp))
            with patch.object(proxy, 'REQUESTS', 1):
                with self.assertRaises(ValueError): cache.fetch('/unknown/path')
                with self.assertRaisesRegex(ValueError, 'request budget'): cache.fetch(PATH)

    def test_existing_or_linked_cache_is_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            parent = Path(temp); existing = parent/'existing'; existing.mkdir(); (existing/'keep').write_text('keep')
            link = parent/'link'; link.symlink_to(existing, target_is_directory=True)
            for directory in (existing, link):
                with self.assertRaisesRegex(ValueError, 'fresh owned'): proxy.Cache(directory)
            self.assertEqual((existing/'keep').read_text(), 'keep')

    def test_failed_required_receipt_cannot_publish_or_reuse_artifact(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = proxy.Cache(Path(temp)); opener = Opener()
            with patch.object(proxy, 'LOG_BYTES', 0), patch.object(proxy, 'build_opener', return_value=opener):
                for _ in range(2):
                    with self.assertRaisesRegex(ValueError, 'log budget'): cache.fetch(PATH)
            self.assertEqual(opener.calls, 1)
            self.assertFalse(cache.items)
            self.assertFalse((Path(temp)/'events.jsonl').exists())

    def test_http_credentials_and_wrong_authorities_are_rejected_before_fetch(self):
        with tempfile.TemporaryDirectory() as temp:
            server = proxy.Server(('127.0.0.1', 0), proxy.Handler)
            server.cache = proxy.Cache(Path(temp))
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            host, port = server.server_address
            try:
                with patch.object(server.cache, 'fetch') as fetch:
                    for method in ('GET', 'HEAD'):
                        for headers in ({'Authorization': 'synthetic'}, {'Proxy-Authorization': 'synthetic'}, {'Cookie': 'synthetic=1'}, {'Host': 'synthetic@'+host+':'+str(port)}, {'Host': 'example.test'}, {'Host': host}):
                            with self.subTest(method=method, headers=headers):
                                client = http.client.HTTPConnection(host, port, timeout=2)
                                try:
                                    client.request(method, PATH, headers=headers)
                                    response = client.getresponse()
                                    self.assertEqual(response.status, 502)
                                    response.read()
                                finally: client.close()
                    fetch.assert_not_called()
                opener = Opener()
                with patch.object(proxy, 'build_opener', return_value=opener):
                    client = http.client.HTTPConnection(host, port, timeout=2)
                    try:
                        client.request('GET', PATH)
                        response = client.getresponse()
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.read(), b'fixture')
                    finally: client.close()
            finally:
                server.shutdown(); server.server_close(); worker.join(timeout=2)


if __name__ == '__main__': unittest.main()
