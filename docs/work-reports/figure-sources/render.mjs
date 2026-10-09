import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const reportDir = path.dirname(sourceDir);
const font = 'PingFang SC';
const colors = { ink: '#24364b', muted: '#64748b', blue: '#355f87', green: '#26756a', red: '#ad4c43', line: '#cad4df', light: '#eef4f9', pale: '#eef7f3', warn: '#fff3ed' };
const manifest = [];
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
function output(person, name, title, svg, source = null) {
  const dir = path.join(reportDir, person, 'attachments');
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, name);
  fs.writeFileSync(`${base}.svg`, svg);
  if (source) fs.writeFileSync(`${base}.dot`, source);
  execFileSync('rsvg-convert', ['--zoom', '2', '--output', `${base}.png`, `${base}.svg`]);
  manifest.push({ person, name, title, png: `${person}/attachments/${name}.png`, source: `${person}/attachments/${name}.${source ? 'dot' : 'svg'}` });
}
function dot(person, name, title, body) {
  const source = `digraph G {\ngraph [rankdir=TB, newrank=true, bgcolor="white", pad=0.35, nodesep=0.5, ranksep=0.6, splines=polyline, fontname="${font}", fontsize=23, fontcolor="${colors.ink}", labelloc=t, label="${title}\\n "];\nnode [shape=box, style="rounded,filled", fillcolor="${colors.light}", color="${colors.line}", penwidth=1.3, fontname="${font}", fontsize=17, fontcolor="${colors.ink}", margin="0.22,0.16"];\nedge [color="${colors.blue}", penwidth=1.5, arrowsize=0.7, fontname="${font}", fontsize=14, fontcolor="${colors.muted}"];\n${body}\n}\n`;
  const svg = execFileSync('dot', ['-Tsvg'], { input: source, encoding: 'utf8' });
  output(person, name, title, svg, source);
}
function svgStart(title, subtitle, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img"><title>${esc(title)}</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${colors.blue}"/></marker><marker id="redarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${colors.red}"/></marker></defs><rect width="1200" height="${height}" fill="white"/><g font-family="${font},sans-serif" fill="${colors.ink}"><text x="48" y="55" font-size="32" font-weight="600">${esc(title)}</text><text x="48" y="94" font-size="20" fill="${colors.muted}">${esc(subtitle)}</text>`;
}
function txt(x,y,text,size=22,anchor='middle',color=colors.ink) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${color}">${esc(text)}</text>`;
}
function box(x,y,w,h,lines,fill=colors.light,size=21) {
  const lineHeight=size*1.5, start=y+h/2-(lines.length-1)*lineHeight/2+size*.35;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${colors.line}"/>`+lines.map((s,i)=>txt(x+w/2,start+i*lineHeight,s,size)).join('');
}
function sequence(person,name,title,subtitle,lanes,events,height,footer) {
  let svg=svgStart(title,subtitle,height);
  const xs=lanes.length===2?[235,965]:[215,600,985];
  lanes.forEach((label,i)=>{svg+=`<line x1="${xs[i]}" y1="174" x2="${xs[i]}" y2="${height-85}" stroke="${colors.line}" stroke-width="2" stroke-dasharray="6 6"/>`;svg+=box(xs[i]-155,126,310,55,[label],colors.light,23);});
  for(const e of events){
    if(e.type==='note') { const w=e.width||320;svg+=box(xs[e.lane]-w/2,e.y,w,e.h||65,e.lines,e.fill||colors.pale,e.size||20);continue; }
    if(e.type==='band') {svg+=box(50,e.y,1100,e.h||64,e.lines,e.fill||colors.light,e.size||21);continue;}
    const a=xs[e.from],b=xs[e.to], color=e.error?colors.red:colors.blue;
    svg+=`<line x1="${a}" y1="${e.y}" x2="${b}" y2="${e.y}" stroke="${color}" stroke-width="2.2" ${e.dashed?'stroke-dasharray="8 6"':''} marker-end="url(#${e.error?'redarrow':'arrow'})"/>`;
    const lines=Array.isArray(e.label)?e.label:[e.label];
    lines.forEach((s,i)=>{svg+=txt((a+b)/2,e.y-14-(lines.length-1-i)*27,s,21,'middle',color);});
    if(e.cross){svg+=`<path d="M ${b-9} ${e.y-9} l18 18 m0 -18 l-18 18" stroke="${colors.red}" stroke-width="3"/>`;}
  }
  svg+=txt(50,height-28,footer,19,'start',colors.muted)+'</g></svg>';
  output(person,name,title,svg);
}

dot('nichengjin','figure-close-order','关闭选课的准入与等待顺序',`
  close [label="发起关闭选课\\n立即停止新的写请求准入"];
  reject [label="新发起的写请求\\n拒绝进入，页面重新读取", fillcolor="${colors.warn}"];
  active [label="已取得准入的请求\\n继续事务并检查自然截止"];
  wait [label="等待已准入请求全部结束\\n等待期间不持有普通写锁"];
  settle [label="进入关闭事务\\n调剂、取消、形成完整账单"];
  persist [label="同一事务提交\\n最终课表＋账单版本＋待发送记录"];
  closed [label="关闭完成\\n计费暂时失败不撤销关闭", fillcolor="${colors.pale}"];
  send [label="事务提交后后台发送账单\\n未确认的账单按原编号重试"];
  close -> wait; close -> reject [label="新请求"];
  active -> wait [label="处理结束"];
  {rank=same; close; active;}
  {rank=same; reject; wait;}
  wait -> settle -> persist -> closed -> send;
`);

sequence('haoyu','figure-multi-page','两个页面编辑同一份课表','机制示意 · 本地内容与开始编辑时的版本必须一起保留',
 ['页面 A','服务器','页面 B'],[
  {type:'band',y:210,lines:['初始状态：两个页面均读取到 v51']},
  {type:'note',lane:2,y:297,lines:['将主选改为三门','本地仍保留 v51'],h:78},
  {from:0,to:1,y:332,label:'提交修改，携带 v51'},
  {from:1,to:0,y:422,label:'保存成功，返回 v52'},
  {from:2,to:1,y:510,label:'轮询读取服务器课表'},
  {from:1,to:2,y:598,label:'返回 v52：四门主选'},
  {type:'note',lane:2,y:630,lines:['保留三门本地编辑与 v51','提示冲突，暂停保存与提交'],width:370,h:92},
  {type:'band',y:753,lines:['学生核对差异并确认采用 v52，随后重新编辑'],fill:colors.pale}
 ],885,'依据：学生端报告 4.1 节的 v51／v52 示例；不自动合并两份课表。');

sequence('haoyu','figure-stale-response','旧读取响应晚于保存结果到达','机制示意 · 收到较旧或相同版本时，保留当前副本',
 ['学生页面','服务器'],[
  {from:0,to:1,y:238,label:'① 发起读取，服务器取得 v7'},
  {from:0,to:1,y:329,label:'② 发起保存'},
  {from:1,to:0,y:420,label:'③ 保存成功，返回 v8'},
  {type:'note',lane:0,y:445,lines:['采用 v8','本地标记为已同步'],h:78},
  {from:1,to:0,y:610,label:'④ 先前的读取此时才返回 v7',dashed:true},
  {type:'note',lane:0,y:639,lines:['v7 低于当前 v8','忽略旧响应，页面保持 v8'],width:370,h:92}
 ],810,'依据：学生端报告 4.2 节与 hooks.test.ts；箭头间距不表示真实耗时。');

dot('mazhe','figure-teaching-transaction','整份授课调整的检查与回滚',`
  request [label="原安排 A、B → 目标 A、C\\n提交整份目标及原版本"];
  check [shape=diamond,style=filled,label="事务内整份目标校验通过？\\n身份／版本／资格／占用／时间",fontsize=15];
  keep [label="拒绝本次修改\\n保留原安排 A、B",fillcolor="${colors.warn}"];
  write [label="在同一事务内更新\\n当前授课关系与授课历史"];
  commit [shape=diamond,style=filled,label="全部写入成功？"];
  rollback [label="事务回滚\\n保留原安排 A、B",fillcolor="${colors.warn}"];
  done [label="确认目标安排 A、C\\n返回新版本",fillcolor="${colors.pale}"];
  request -> check; check -> keep [label="否"];check -> write [label="是"];
  write -> commit;commit -> rollback [label="否"];commit -> done [label="是"];
  {rank=same; keep; write;}
  {rank=same; rollback; done;}
`);

dot('mazhe','figure-grade-results','批量成绩的两层校验与逐格结果',`
  request [label="提交一批成绩\\n教授、班次、学期与学生名单"];
  scope [shape=diamond,style=filled,label="整批范围合法？"];
  reject [label="整份拒绝\\n不提前保存任何一格",fillcolor="${colors.warn}"];
  cells [label="逐格判断成绩值\\n以下为十名本班学生的验收用例"];
  valid [label="八格：合法成绩\\nA、B、C、D、F、I、D、I"];
  empty [label="一格：空白\\n原成绩 B"];
  invalid [label="一格：输入 Z\\n原成绩 C"];
  saved [label="八格分别保存\\n读回已保存成绩",fillcolor="${colors.pale}"];
  unchanged [label="不修改，保留 B\\n显示未修改"];
  error [label="拒绝该格，保留 C\\n输入 Z 留待修正",fillcolor="${colors.warn}"];
  request -> scope;scope -> reject [label="否"];scope -> cells [label="是"];
  cells -> valid;cells -> empty;cells -> invalid;
  valid -> saved;empty -> unchanged;invalid -> error;
  {rank=same;valid;empty;invalid;}
  {rank=same;saved;unchanged;error;}
`);

dot('fenghaiyang','figure-status-preview','人员状态变更的预览与确认',`
  edit [label="选择人员与目标状态\\n保留开始编辑时的版本"];
  preview [label="预览本次修改的影响\\n当前课程／授课／账号与会话"];
  confirm [label="教务核对后确认\\n提交同一份修改与预览凭据"];
  check [shape=diamond,style=filled,label="事务内重新校验：\\n版本、关联数据与关闭状态一致？",fontsize=16];
  redo [label="拒绝使用旧预览\\n重新读取、预览并确认",fillcolor="${colors.warn}"];
  tx [label="同一事务内处理\\n课程清理＋人员状态＋会话＋审计"];
  success [label="全部成功后提交\\n显示最新人员状态",fillcolor="${colors.pale}"];
  fail [label="任一步失败则整体回滚\\n保留操作前的数据",fillcolor="${colors.warn}"];
  edit -> preview -> confirm -> check;
  check -> redo [label="否"];check -> tx [label="是"];
  tx -> success [label="成功"];tx -> fail [label="失败"];
  {rank=same;redo;tx;}
  {rank=same;success;fail;}
`);

dot('fenghaiyang','figure-import-rows','名单导入的文件检查与逐行处理',`
  file [label="上传 .xlsx 名单\\n保留 Excel 原始行号"];
  format [shape=diamond,style=filled,label="文件与表头可解析？"];
  whole [label="整份拒绝\\n修正文件后重新上传",fillcolor="${colors.warn}"];
  rows [label="逐行校验与去重\\n必填项、字段格式、唯一标识"];
  good [label="合法的新人员\\n创建人员与账号",fillcolor="${colors.pale}"];
  duplicate [label="已有人员\\n跳过，保留已有资料"];
  bad [label="缺项或内容不合法\\n拒绝该行，记录原因",fillcolor="${colors.warn}"];
  result [label="汇总成功／跳过／拒绝\\n逐行结果对应原表位置"];
  fix [label="教务按行号修正数据\\n重新上传需要处理的内容"];
  file -> format;format -> whole [label="否"];format -> rows [label="是"];
  rows -> good;rows -> duplicate;rows -> bad;
  good -> result;duplicate -> result;bad -> result;result -> fix;
  {rank=same;good;duplicate;bad;}
`);

dot('fenghailun','figure-terminal-snapshot','负载结束后的终态取数顺序',`
  subgraph cluster_old {
    label="旧顺序\\n终态尚未稳定";fontsize=17;color="#e8c5b9";style=rounded;
    oldend [label="客户端测量结束"];
    oldread [label="立即读取数据库快照\\n后端可能仍在处理",fillcolor="${colors.warn}"];
    oldcompare [label="比较课表与注册\\n可能得到暂时差异",fillcolor="${colors.warn}"];
    oldwait [label="到清理阶段才等待后端"];
    oldend -> oldread -> oldcompare -> oldwait;
  }
  subgraph cluster_new {
    label="修正后\\n等待处理结束再核对";fontsize=17;color="#b8d4cb";style=rounded;
    end [label="客户端测量结束"];
    stop [label="停止后台轮询\\n不再产生新的请求"];
    wait [label="等待已进入处理的业务结束"];
    read [label="读取稳定的数据库快照"];
    compare [label="核对课表、注册、容量\\n及客户端最后确认结果",fillcolor="${colors.pale}"];
    end -> stop -> wait -> read -> compare;
  }
  {rank=same;oldend;end;}
  {rank=same;oldread;stop;}
  {rank=same;oldcompare;wait;}
  {rank=same;oldwait;read;}
`);

sequence('fanzhao','figure-billing-retry','账单已保存，但确认响应丢失','机制示意 · 重试沿用同一业务编号与完整账单内容',
 ['业务后端','计费模拟服务','状态文件'],[
  {from:0,to:1,y:240,label:'发送账单 v1'},
  {from:1,to:2,y:320,label:'写入、同步并原子替换'},
  {from:2,to:1,y:399,label:'账单与接收编号已保存'},
  {from:1,to:0,y:483,label:'确认途中断连',dashed:true,error:true,cross:true},
  {type:'note',lane:0,y:510,lines:['记录发送失败','60 秒后具备重试资格'],width:345,h:80,fill:colors.warn},
  {from:0,to:1,y:665,label:'重试相同编号、相同内容'},
  {from:1,to:0,y:753,label:'返回重复接收确认'},
  {type:'band',y:796,lines:['后端标记送达；接收端最新应缴金额保持不变'],fill:colors.pale}
 ],930,'依据：外部系统报告 4.1—4.3、5.1 节；积压时仍需等待到期任务调度。');

{
 const title='账单到达顺序与当前应缴金额';
 let svg=svgStart(title,'机制示意 · 同一学生、同一学期；每一版都表示完整应缴金额',760);
 const xs=[170,600,1030];
 const rows=[{y:220,label:'情形一：按版本顺序到达',events:[['v1 到达','1200 元','首次应用'],['v2 到达','1500 元','替换旧版'],['v2 再次到达','1500 元','重复确认']]},{y:486,label:'情形二：新版先到、旧版迟到',events:[['v2 到达','1500 元','首次应用'],['v1 随后到达','1500 元','保留新版'],['v1 再次到达','1500 元','重复确认']]}];
 for(const row of rows){
  svg+=txt(50,row.y-45,row.label,24,'start');
  row.events.forEach((e,i)=>{
   if(i<2)svg+=`<line x1="${xs[i]+132}" y1="${row.y+64}" x2="${xs[i+1]-132}" y2="${row.y+64}" stroke="${colors.blue}" stroke-width="2" marker-end="url(#arrow)"/>`;
   svg+=box(xs[i]-125,row.y,250,156,[],i===0?colors.light:colors.pale);
   svg+=txt(xs[i],row.y+35,e[0],22);
   svg+=txt(xs[i],row.y+84,e[1],32,'middle',colors.green);
   svg+=txt(xs[i],row.y+127,e[2],19,'middle',colors.muted);
  });
 }
 svg+=txt(50,719,'框中金额为接收端当前应缴总额；新版替换旧版，同版重发不累计金额。',20,'start',colors.muted)+'</g></svg>';
 output('fanzhao','figure-billing-versions',title,svg);
}

execFileSync('Rscript', [path.join(sourceDir, 'performance-plots.R')], { stdio: 'inherit' });
manifest.push({ person:'nichengjin', name:'figure-refresh-stages', title:'三轮目录刷新短测', png:'nichengjin/attachments/figure-refresh-stages.png', source:'figure-sources/performance-plots.R' });
manifest.push({ person:'fenghailun', name:'figure-load-outcomes', title:'原 macOS 2000 用户交易结果', png:'fenghailun/attachments/figure-load-outcomes.png', source:'figure-sources/performance-plots.R' });
fs.writeFileSync(path.join(sourceDir, 'manifest.json'), `${JSON.stringify(manifest,null,2)}\n`);
console.log(`Rendered ${manifest.length} report figures.`);
