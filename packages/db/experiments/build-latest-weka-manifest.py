from pathlib import Path
import argparse, hashlib, json, tarfile

parser=argparse.ArgumentParser()
parser.add_argument('--source-root',type=Path,required=True)
parser.add_argument('--output',type=Path,default=Path(__file__).with_name('weka-amg-kimi-k3-latest-3h.manifest.json'))
args=parser.parse_args(); base=args.source_root.resolve()
root=base/'weka-amg-kda-dram-idle1200-3h-20261104'
points_path=root/'final-results-20261109/main/plot-data.json'
def read(p): return json.loads(p.read_text())
def digest(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def descriptor(p):return {'path':str(p.resolve().relative_to(base)),'sha256':digest(p),'bytes':p.stat().st_size}
def scalar_stats(o):
 if isinstance(o,dict):return {k:scalar_stats(v) for k,v in o.items() if not isinstance(v,list)}
 return o if isinstance(o,(int,float,bool,type(None))) else None

def arg_value(cmd,key):
 return cmd[cmd.index(key)+1] if key in cmd else None

runs=[]; forecast=[]
for p in read(points_path):
 if p['comparison_arm'] not in ['new-weka','prior-internal']:continue
 for key,hashkey in [('source','source_sha256'),('qualification','qualification_sha256'),('input_point_path','input_point_sha256')]:assert digest(Path(p[key]))==p[hashkey]
 q=read(Path(p['qualification']));assert q['measurement_complete'] and q['full_three_hours'];assert p['frontier_eligible']==q['frontier_eligible']
 healthpath=Path(q['phase_cache_health_source']);assert digest(healthpath)==q['phase_cache_health_sha256'];h=read(healthpath)
 results=Path(q['source_results']);archive=results.parent/'artifacts.tar.gz';ad=descriptor(archive)
 if q.get('new_campaign_evidence'):assert ad['sha256']==q['new_campaign_evidence']['archive_sha256']
 files={'aggregate':descriptor(Path(p['source'])),'run_config':descriptor(results/'run-config.json')}
 wanted={'results/server.log':'server_log','results/aiperf_artifacts/profile_export.jsonl':'profile','results/aiperf_artifacts/server_metrics_export.json':'server_metrics'}
 with tarfile.open(archive,'r|gz') as tf:
  for member in tf:
   name=member.name.removeprefix('./')
   if name not in wanted:continue
   assert member.isfile();f=tf.extractfile(member);assert f
   sha=hashlib.file_digest(f,'sha256').hexdigest()
   hashes=[v for k,v in q['source_sha256'].items() if k.endswith('::'+name)]
   assert hashes and all(v==sha for v in hashes),(p['run_id'],name)
   files[wanted[name]]={'path':ad['path'],'sha256':sha,'bytes':member.size,'archive_member':member.name,'archive_sha256':ad['sha256'],'archive_bytes':ad['bytes']}
   if len(files)==5:break
 assert len(files)==5
 c=p['config'];we=p['comparison_arm']=='new-weka';conc=p['concurrency']
 keys={'image','image_tag','image_digest','model','model_revision','tokenizer_revision','harness','dataset_revision','gpu_count','serving_dram_limit_bytes','client_dram_limit_bytes','nvme_hard_quota_bytes','recipe_fingerprint','gpu_memory_utilization','engine_commit','engine_version','sdk_version','sdk_source_commit','mc_store_memcpy','async_scheduling','enable_cumem_allocator','total_cpu_dram_GiB','per_rank_cpu_dram_GiB','per_rank_buffer_GiB','cpu_request_limit','memory_request_limit_GiB','tp','dcp','master_lease_ttl_ms','master_threads','protocol','gid_index','max_num_seqs','cudagraph_capture_sizes','attention_kv_dram_budget_bytes','kda_dram_budget_bytes'}
 config={k:v for k,v in c.items() if k in keys}
 config.update({'gpu_count':8,'benchmark_duration_seconds':10800,'trace_idle_gap_cap_seconds':1200,'system_idle_gap_cap_seconds':10,'spec_method':'none','configuration_variant':'weka-kda-dram-fp8-attention-weka-e558388' if we else p['series'],'harness':'agentx-harness==1.0.12','measured_throughput_duration_seconds':p['measured_throughput_duration_seconds']})
 for k in ['sdk_version','direct_kv_gather','direct_q_gather','cudagraph_mode']:
  if p.get(k) is not None:config[k]=p[k]
 cmd=c.get('server_command',[])
 if we:
  for opt,key in [('--gpu-memory-utilization','gpu_memory_utilization'),('--max-num-seqs','max_num_seqs')]:
   val=arg_value(cmd,opt)
   if val is not None:config[key]=float(val) if key=='gpu_memory_utilization' else int(val)
  compilation=json.loads(arg_value(cmd,'--compilation-config'));config['cudagraph_mode']=compilation['cudagraph_mode'];config['cudagraph_capture_sizes']=compilation['cudagraph_capture_sizes']
  config.update({'kda_dram_budget_bytes':1200*1024**3,'attention_kv_dram_budget_bytes':0,'nvme_hard_quota_bytes':8*1024**4,'kda_state_dtype':'fp8','kda_tail_spill_enabled':False})
 else:config['total_cpu_dram_GiB']=2248
 code='clean' if p['clean_backend_qualified'] else 'metric-integrity' if conc==128 else 'dram-recovery'
 health={'status':'completed','measurement_complete':True,'qualification_code':code,'profiling_http_errors':q['errors_by_phase'].get('profiling',0),'errors_by_phase':q['errors_by_phase'],'warnings':q['warnings'],'problems':q['problems'],'log_observations_by_phase':h.get('log_observations_by_phase',{}),'backend_health_reasons':h.get('backend_health_reasons',[]),'strict_clean_backend_qualified':p['clean_backend_qualified']}
 cache={'phase_time_ranges':h['phase_ranges'],'phases':{name:scalar_stats(s) for name,s in h['phases'].items()},'metric_observation_source':p.get('metric_observation_source'),'metric_integrity_qualified':code!='metric-integrity','notes':['Connector bytes are not physical NVMe traffic.','Counter backsteps and observation gaps remain qualified in health warnings; do not treat derived counter rates as universally reliable.']}
 plot={k:p[k] for k in ['run_id','concurrency','replicate','total_tps_gpu','input_tps_gpu','output_tps_gpu','theoretical_hit_rate','uncached_tps_gpu','p90_interactivity','p90_ttft']};plot['series']='weka' if we else 'native'
 provenance={'source_archive_sha256':ad['sha256'],'source_archive_bytes':ad['bytes'],'aggregate_sha256':p['source_sha256'],'qualification_sha256':p['qualification_sha256'],'input_point_sha256':p['input_point_sha256'],'phase_cache_health_sha256':q['phase_cache_health_sha256'],'original_series':p['series'],'point_id':p['point_id'],'measurement_windows':q['measurement_windows'],'qualification':{'measurement_complete':True,'full_three_hours':True,'clean_backend_qualified':p['clean_backend_qualified'],'frontier_eligible':p['frontier_eligible']},'new_campaign_evidence':q.get('new_campaign_evidence')}
 runs.append({'run_id':p['run_id'],'series':'weka' if we else 'native','concurrency':conc,'replicate':p.get('replicate'),'clean_backend_qualified':p['clean_backend_qualified'],'frontier_eligible':p['frontier_eligible'],'plot_metrics':plot,'configuration':config,'health':health,'cache_evidence':cache,'provenance':provenance,'files':files})
 size=sum(v['bytes'] for v in files.values());forecast.append({'run_id':p['run_id'],'selected_raw_bytes':size,'archive_bytes':ad['bytes']});print(p['run_id'],f'{size/1024**2:.1f}MiB selected',flush=True)
assert len(runs)==22
manifest={'version':1,'slug':'weka-amg-kimi-k3-latest-3h','title':'Kimi K3: Latest WEKA AMG vs Internal B300 Mooncake','description':'Three-hour AgentX measurements with a twenty-minute trace-idle cap: thirteen latest-WEKA and nine internal-Mooncake runs. Three flagged WEKA measurements remain excluded from the clean frontier.','reference_points':[],'comparison_notes':{'benchmark_duration_seconds':10800,'trace_idle_gap_cap_seconds':1200,'system_idle_gap_cap_seconds':10,'display_date':'2026-11-09','source_plot_sha256':digest(points_path),'baseline_policy':'Best measured envelope across four internal serving variants; original configuration identities are retained per run.','scenario_policy':'Separate from one-hour/five-minute-idle scenarios; no published one-hour reference is included.','cache_policy':'Latest WEKA uses 1200 GiB FP8 KDA-tail DRAM with no spill and 8 TiB WEKA attention-KV quota. Internal Mooncake uses 2,248 GiB DRAM over EFA.','qualification_policy':'C128 has metric-integrity flag; C140/C180 have DRAM-recovery flags. All 22 full measurements retained; 19 are clean.','limits':['Different images, cache contents, transports and serving adaptations prevent a backend-only causal interpretation.','System-wide idle compression cap of 10 seconds means a trace-idle cap of 1,200 seconds is not guaranteed wall-clock idleness.']},'runs':runs}
text=json.dumps(manifest,indent=2)+'\n';assert '/Users/' not in text and 'server_env' not in text and 'server_command' not in text
args.output.write_text(text)
forecastpath=root/'inferencex-ui-import-latest-3h'/'preparation-forecast.json';forecastpath.parent.mkdir(exist_ok=True);forecastpath.write_text(json.dumps({'runs':forecast,'max_selected_raw_bytes':max(v['selected_raw_bytes'] for v in forecast),'sum_selected_raw_bytes':sum(v['selected_raw_bytes'] for v in forecast)},indent=2)+'\n')
print(args.output,digest(args.output),flush=True)
