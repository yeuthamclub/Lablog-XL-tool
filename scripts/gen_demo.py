"""Sinh file log FinishedJobs MẪU (dữ liệu giả, không phải bệnh nhân thật) để chạy thử."""
import random, datetime, sys
random.seed(7)
ASSAYS = {  # tên: (article, lot, serial, cal, đơn vị kiểu dose, (lo,hi) ngưỡng đo, (ref lo, ref hi), log-normal (mu, sigma))
 'TSH':   ('310360','184021',2201,'00021',(0.005,100),(0.4,4.0),(0.5,0.9)),
 'FT4':   ('310370','185110',2302,'00022',(1.0,100),(12.0,22.0),(2.8,0.18)),
 'PSA':   ('314381','220311',1501,'00014',(0.01,100),(None,4.0),(0.2,1.0)),
 'CEA':   ('314201','220522',1602,'00014',(0.2,500),(None,5.0),(0.6,0.9)),
 'HBsAgQ':('310250','132067',3068,'00013',(0.03,150),(None,0.05),(-3.0,1.2)),
 'HBeAg': ('310150','320014',1844,'00013',(0.01,120),(None,1.0),(-3.2,1.6)),
}
CONTROLS = {'TSH':[('#C-TSH-1',0.45,0.03),('#C-TSH-2',8.2,0.35)],'FT4':[('#C-FT4-1',9.5,0.45),('#C-FT4-2',35.0,1.4)],
            'PSA':[('#C-PSA-1',0.62,0.03),('#C-PSA-2',9.8,0.4)],'CEA':[('#C-CEA-1',2.4,0.12),('#C-CEA-2',20.5,0.9)],
            'HBsAgQ':[('#C-HBs-1',0.03,0.002),('#C-HBs-2',0.27,0.014)],'HBeAg':[('#C-HBe-1',0.011,0.002),('#C-HBe-2',0.48,0.02)]}
lines=[]; cycle=30000
def line(kind,t,sid,assay,rlu,art,lot,serial,dose=None,cal='',flags='',rep=1):
    global cycle
    s=(f"{kind}-|({t:%Y/%m/%d %H:%M:%S})|SampleID: '{sid}'|Replicate: {rep}|RLU: {rlu}|Assay: {assay}|StartCycle: {cycle} (0x{cycle:X})|"
       f"DarkCountEvents: Nothing|SpikeEvents: Nothing|Article Number: {art}|Integral Lot: {lot}|Integral Serial: {serial}|"
       f"Starter Lot A1: 346151|Starter Lot A2: 345251|Ancillary Lot: |Ancillary Serial: |Dilution Factor: 1")
    if kind=='D': s+=f"|Dose: {dose}|CalibrationID: {cal}|Flags: {flags}"
    return s
def fmt(v): return f"{v:.4f}" if v<0.1 else f"{v:.3f}" if v<10 else f"{v:.2f}" if v<100 else f"{v:.1f}"
def result(t,sid,assay,v,extra_flags=()):
    global cycle
    art,lot,serial,cal,(lo,hi),(rl,rh),_=ASSAYS[assay]
    flags=list(extra_flags)
    if v<lo: dose=f"<{fmt(lo)}"; flags.append('BelowAssayRange')
    elif v>hi: dose=f">{fmt(hi)}"; flags.append('AboveAssayRange')
    else: dose=fmt(v)
    if not sid.startswith('#'):
        if rh is not None and v>rh: flags.append('AboveNormalRange')
        if rl is not None and v<rl: flags.append('BelowNormalRange')
    rlu=max(1,int(v*9000*random.uniform(.95,1.05)))
    lines.append(line('R',t,sid,assay,rlu,art,lot,serial)); lines.append(line('D',t,sid,assay,rlu,art,lot,serial,dose,cal,','.join(flags)))
    cycle+=1
start=datetime.datetime(2026,9,1)
sid=4100000
for day in range(30):
    d=start+datetime.timedelta(days=day)
    if d.weekday()==6: continue
    t=d.replace(hour=7,minute=40)
    # QC buổi sáng (bỏ một số ngày để thấy "chạy BN không có QC")
    for a,levels in CONTROLS.items():
        if random.random()<0.8:
            for name,m,s in levels:
                v=random.gauss(m,s)
                if day==17 and a=='TSH' and name.endswith('2'): v=m+3.4*s   # một điểm 1-3s
                if day in (21,22) and a=='FT4' and name.endswith('1'): v=m+2.3*s  # 2-2s
                result(t,name,a,max(v,0.0001)); t+=datetime.timedelta(seconds=random.randint(20,40))
    t=d.replace(hour=8,minute=random.randint(0,30))
    for _ in range(random.randint(18,40)):
        sid+=random.randint(1,7); s=str(sid)
        panel=random.choice([['TSH','FT4'],['TSH','FT4'],['TSH'],['PSA'],['CEA'],['HBsAgQ'],['HBeAg'],['HBsAgQ','HBeAg'],['PSA','CEA']])
        thyroid=random.random()
        for a in panel:
            mu,sg=ASSAYS[a][6]
            v=random.lognormvariate(mu,sg)
            if a=='TSH' and thyroid<0.12: v*=random.uniform(3,12)
            if a=='FT4' and thyroid<0.12: v*=random.uniform(0.45,0.75)
            if a=='TSH' and thyroid>0.95: v*=0.02
            if a=='FT4' and thyroid>0.95: v*=random.uniform(1.4,2.2)
            ex=('ReagentOBSExpired',) if (a=='CEA' and day==24) else ()
            result(t,s,a,v,ex); t+=datetime.timedelta(seconds=random.randint(20,90))
        t+=datetime.timedelta(minutes=random.randint(1,12))
    # CLEAN buổi tối (bỏ vài ngày)
    if random.random()<0.75:
        ct=d.replace(hour=19,minute=random.randint(20,59))
        for i in range(5):
            lines.append(line('R',ct,'CLEAN','CLEAN',1,'310995','388039',3557))
            lines.append(line('D',ct,'CLEAN','CLEAN',1,'310995','388039',3557,'1.00',''))
            cycle+=1; ct+=datetime.timedelta(minutes=3)
open(sys.argv[1],'w',newline='\r\n').write('\n'.join(lines)+'\n')
print(len(lines),'dòng')
