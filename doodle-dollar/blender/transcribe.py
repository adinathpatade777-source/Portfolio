import json,sys
from faster_whisper import WhisperModel
m=WhisperModel('base.en',device='cpu',compute_type='int8',cpu_threads=4)
import numpy as np
audio=np.fromfile(sys.argv[1],dtype=np.float32)
segs,info=m.transcribe(audio,word_timestamps=True,beam_size=1)
out=[]
for s in segs:
    out.append({'start':s.start,'end':s.end,'text':s.text,'words':[{'w':w.word,'s':w.start,'e':w.end} for w in s.words]})
    print(f"{s.start:7.2f} {s.text}",flush=True)
json.dump(out,open(sys.argv[2],'w'))
