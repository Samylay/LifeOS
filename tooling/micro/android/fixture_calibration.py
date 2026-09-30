"""Fixed fixture calibration requests with an explicit one-use operator permit.

No command runs on import, no calibration is admitted here, and no health count
is manufactured. Real image/event/exit evidence must be reviewed separately.
"""
from pathlib import Path
import hashlib
import re

try:
    from . import admission as a, fixture_health as health
except ImportError:
    import admission as a
    import fixture_health as health

PACKAGE = 'app.micro.factory.fixture'
ROLES = {'factory-source','factory-target'}
SOURCE_SHA = '8cfb316455a451d2781bfd4dc589acb91bb7ef52'
CRASH = ('shell','am','crash','--user','0',PACKAGE)


def authority():
    return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


class CalibrationOperations:
    """Device base class preserving installed-byte, lease and stream guards."""
    def fixture_calibration_identity(self) -> dict:
        self._fixture_health_scope(); self._ensure_installed()
        identity = self.facts()
        fingerprint = self._call(('shell','getprop','ro.build.fingerprint'),timeout=5,maximum=1024).decode('utf-8').strip()
        if not re.fullmatch(r'[A-Za-z0-9_.:/+-]{1,512}',fingerprint):
            raise a.Rejected('Unknown bounded API36 image fingerprint')
        uid = self._call(('shell','pm','list','packages','-U',PACKAGE),timeout=5,maximum=8192)
        match = re.fullmatch(rb'package:app\.micro\.factory\.fixture uid:([0-9]+)\n?',uid)
        if not match or not 10000 <= int(match[1]) < 100000:
            raise a.Rejected('Unknown actual user0 fixture UID')
        pid = self._call(('shell','pidof',PACKAGE),timeout=5,maximum=1024)
        if not re.fullmatch(rb'[1-9][0-9]{0,9}\n?',pid) or int(pid) >= 2**31:
            raise a.Rejected('One exact running fixture process required')
        clock = self._fixture_health_clock()
        self._ensure_installed()
        return {'role':self.role,'package':PACKAGE,'api':36,'abi':'x86_64',
                'fingerprint':fingerprint,'packageUid':int(match[1]),'pid':int(pid),
                'clock':clock,'leaseSha256':self._lease_pin,
                'apkSha256':self._installed['apkSha256'],'facts':identity,
                'controllerSha256':authority()}

    def fixture_calibration_crash(self, ticket: health.Ticket, permit: a.Evidence) -> dict:
        """One operator-permitted package crash inside its own health window."""
        self._fixture_health_scope(); self._ensure_installed()
        if self.role not in ROLES or not isinstance(ticket,health.Ticket):
            raise a.Rejected('Fixed fixture calibration ticket required')
        window = self._health_windows.get(ticket.token)
        if not window or window['ticket'] != ticket or len(self._health_windows) != 1:
            raise a.Rejected('Exact current owned health ticket required')
        if ticket.role != self.role or ticket.lease_sha256 != self._lease_pin or ticket.apk_sha256 != self._installed['apkSha256']:
            raise a.Rejected('Calibration role/lease/installed APK changed')
        if ticket.controller_sha256 != hashlib.sha256(Path(health.__file__).read_bytes()).hexdigest():
            raise a.Rejected('Health controller changed before calibration')
        if not isinstance(permit,a.Evidence) or not re.fullmatch(r'native-health/calibration-permits/[0-9a-f]{32}\.json',permit.path):
            raise a.Rejected('Fixed operator calibration permit path required')
        value = self.store.json(permit)
        a.exact(value,{'schema','purpose','role','artifactRecord','leaseSha256','sourceSha',
                      'imageProfile','controllerSha256','expiresAt'},'operator calibration permit')
        if (value['schema'] != 'micro.android.fixture-calibration-permit/1'
                or value['purpose'] != 'one-fixture-crash-positive-control'
                or value['role'] != self.role or value['leaseSha256'] != self._lease_pin
                or value['artifactRecord'] != self._installed['record'].json()
                or value['sourceSha'] != SOURCE_SHA or value['controllerSha256'] != authority()):
            raise a.Rejected('Calibration permit belongs to another authority')
        expiry = a.number(value['expiresAt'],'calibration permit expiry')
        if not self.backend.clock() < expiry <= self.backend.clock()+3600:
            raise a.Rejected('Calibration permit expired or unbounded')
        record = self.store.json(self._installed['record'])
        if record.get('context',{}).get('sourceSha') != SOURCE_SHA:
            raise a.Rejected('Calibration is limited to the frozen fixture source')
        profile_ref = a.Evidence.parse(value['imageProfile'])
        if not re.fullmatch(r'native-health/image-profiles/[0-9a-f]{32}\.json',profile_ref.path):
            raise a.Rejected('Fixed reviewed image profile path required')
        profile = self.store.json(profile_ref)
        a.exact(profile,{'schema','api','abi','fingerprint','imageSourceReceipt'},'reviewed fixture image profile')
        if profile['schema'] != 'micro.android.fixture-image-profile/1' or profile['api'] != 36 or profile['abi'] != 'x86_64':
            raise a.Rejected('Image profile is outside fixture API36 scope')
        self.store.verify(a.Evidence.parse(profile['imageSourceReceipt']))
        use_path='native-health/calibration-use/'+permit.sha256+'.json'
        if self.store.path(use_path).exists():
            raise a.Rejected('Calibration permit already consumed, no retry')
        before = self.fixture_calibration_identity()
        if before['fingerprint'] != profile['fingerprint']:
            raise a.Rejected('Actual fixture image differs from reviewed profile')
        if not self.backend.clock() < expiry:
            raise a.Rejected('Calibration permit expired during identity collection')
        self.store.path('native-health/calibration-use').mkdir(mode=0o700,parents=True,exist_ok=True)
        self.store.write(use_path,{'schema':'micro.android.fixture-calibration-use/1',
            'permit':permit.json(),'ticket':ticket.token,'identity':before,
            'status':'operation-requested-outcome-unobserved'})
        # Device._mutation rechecks active stream, installed bytes and lease.
        # Package/user are fixed, and no caller supplied PID is executed.
        result = {'operation':'fixture-calibration-crash-requested','role':self.role,'package':PACKAGE,'user':0,
                'sourceSha':SOURCE_SHA,'artifactRecord':self._installed['record'].json(),
                'fixturePid':before['pid'],'packageUid':before['packageUid'],
                'startClock':before['clock'],'endClock':None,'fingerprint':before['fingerprint'],
                'leaseSha256':self._lease_pin,'apkSha256':self._installed['apkSha256'],
                'permit':permit.json(),'imageProfile':profile_ref.json(),'ticket':ticket.token,
                'argvSuffix':list(CRASH),'stdoutSha256':None,'stdoutBytes':None,
                'controllerSha256':authority(),'failure':None,
                'healthVerdict':'unclaimed-requires-actual-event-and-exit-record'}
        first = None
        try:
            # Authorize the execution request now; guarded completion may follow expiry.
            if not self.backend.clock() < expiry:
                raise a.Rejected('Calibration permit expired before execution request')
            output = self._mutation(CRASH,timeout=10,maximum=8192)
            if not isinstance(output,bytes) or len(output)>8192:
                raise a.Rejected('Invalid bounded calibration response')
            result.update(operation='fixture-calibration-crash-issued',
                stdoutSha256=hashlib.sha256(output).hexdigest(),stdoutBytes=len(output))
            result['endClock']=self._fixture_health_clock()
        except Exception as error:
            first=error
            result['failure']={'type':type(error).__name__,'reason':str(error)[:800],
                'stdoutPrefix':getattr(error,'stdout_prefix',b'')[:1024].decode('utf-8',errors='replace'),
                'stderrPrefix':getattr(error,'stderr_prefix',b'')[:1024].decode('utf-8',errors='replace'),
                'transport':getattr(error,'transport_facts',None),
                'transportCleanupFailure':getattr(error,'transport_cleanup_failure',None)}
        try:
            observed=self.store.write('native-health/calibration-use/'+permit.sha256+'.result.json',result)
        except Exception as error:
            if first:
                first.add_note('Calibration result retention failed: '+str(error)[:800])
                raise first
            raise
        if first:
            first.calibration_evidence=observed
            raise first
        return dict(result,receipt=observed.json())
