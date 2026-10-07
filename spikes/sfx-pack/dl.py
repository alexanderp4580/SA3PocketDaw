import sys
from huggingface_hub import hf_hub_download
repo,path,dest=sys.argv[1:4]
p=hf_hub_download(repo,path,local_dir=dest)
print('DONE',p,flush=True)
