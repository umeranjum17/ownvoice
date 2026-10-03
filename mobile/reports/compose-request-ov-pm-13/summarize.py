from pathlib import Path
import json,subprocess,shutil,re,hashlib
root=Path('/home/umer/lab-tmp/ov-pm-13')
evidence=Path('/home/umer/.treehouse/firstmate-8bf1b0/4/firstmate/data/ov-pm-13/evidence')
repo=Path('/home/umer/.treehouse/ownvoice-92cfa5/8/ownvoice')
raw=subprocess.check_output(['node','--experimental-strip-types',str(repo/'mobile/reports/phone-agent-live/evaluate.mjs'),str(root/'captures')],text=True)
rows=[json.loads(line) for line in raw.splitlines() if line.startswith('{')]
if len(rows)!=12:raise RuntimeError(f'Expected twelve captured rows; got {len(rows)}')
for row in rows:
 name=f"{row['mode']}-{row['task']}"
 trace=json.loads((root/'captures'/name/'events.json').read_text())
 ev=trace['events'];done=next((x for x in ev if x['event']=='done'),None)
 row['stop']=done['out']['stop'] if done else None
 row['finished']=trace['finished']
 row['failure']=[x for x in ev if x['event']=='failure']
 row['rawMarkdown']=bool(re.search(r'\*\*|__|`|(?m:^\s{0,3}#{1,6}\s)|(?m:^\s*[-*+]\s)',row['final']))
 row['squareBrackets']=bool(re.search(r'[\[\]]',row['final']))
 row['capabilityInNote']=bool(re.search(r'\bI (?:can[’\']?t|cannot|can not|am unable to) (?:send|email|post|message|update|change)',row['final'],re.I))
 approvals=[json.loads(x['call']['args']).get('body') for x in ev if x['event']=='approval']
 row['approvedBodyMatchesDisplayed']=all(body==row['final'] for body in approvals)
 row['mockedFalse']=bool(re.search(r'"mocked":false', (root/'captures'/name/'guards.txt').read_text()))
 out=evidence/name;out.mkdir(exist_ok=True)
 for f in ['events.json','guards.txt','done.png','run.mp4']:
  if (root/'captures'/name/f).exists():shutil.copy(root/'captures'/name/f,out/f)
 subprocess.run(['magick',str(out/'done.png'),'-resize','800x',str(out/'done-view.png')],check=True)
rows.sort(key=lambda r:(r['mode']=='script',r['task']))
(evidence/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
tiles=[]
for row in rows:
 name=f"{row['mode']}-{row['task']}"
 tile=root/f"{name}-tile.png"
 subprocess.run(['magick',str(evidence/name/'done.png'),'-resize','270x600','-background','#e8e8e8','-gravity','center','-extent','270x600','-gravity','north','-splice','0x32','-font','/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Regular.ttf','-pointsize','18','-fill','#222222','-annotate','+0+6',f"{row['mode'].title()} {row['task']}",str(tile)],check=True)
 tiles.append(str(tile))
subprocess.run(['magick','montage',*tiles,'-tile','4x3','-geometry','270x632+0+0',str(evidence/'OWNVOICE-compose-request-final-screens.png')],check=True)
subprocess.run(['magick',str(evidence/'OWNVOICE-compose-request-final-screens.png'),'-resize','800x',str(evidence/'contact-view.png')],check=True)
print(json.dumps(rows,ensure_ascii=False,indent=2))
