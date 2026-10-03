from pathlib import Path
import sys,tempfile,unittest,json
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from native_acquire import Supervisor
class MemoryObservationTests(unittest.TestCase):
 def test_owned_cgroup_stat_records_reclaimable_file_and_shmem_separately(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);g=root/'synthetic-cgroup';g.mkdir();(root/'receipts').mkdir()
   (g/'memory.stat').write_text('anon 101\nfile 202\nshmem 33\nfile_mapped 1\n')
   for k,v in {'memory.current':'303','memory.peak':'400','memory.events':'oom 0\noom_kill 0\n','pids.current':'1','pids.peak':'2','cpu.stat':'usage_usec 1\n'}.items():(g/k).write_text(v)
   s=Supervisor.__new__(Supervisor);s.state=root;s.resource_roles=('client',);s.cgroups={'client':g};s.receipt={}
   s.sample_owned_jobs();x=json.loads((root/'receipts/live-cgroup-samples.jsonl').read_text())
   self.assertEqual(x['client']['memory.stat'],{'anon':101,'file':202,'shmem':33});self.assertEqual(x['client']['memory.current'],'303');self.assertNotIn('file_mapped',x['client']['memory.stat'])
if __name__=='__main__':unittest.main()
