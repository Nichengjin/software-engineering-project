#!/usr/bin/env node
// US-030: render the planning and module diagrams with local Graphviz/librsvg.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'docs/project-management/images');
mkdirSync(out, { recursive: true });
const inputs = JSON.parse(readFileSync(join(root, 'docs/project-management/estimation-inputs.json'), 'utf8'));
const calc = JSON.parse(execFileSync(process.execPath, [join(root, 'scripts/course-estimates.mjs'), '--json'], { encoding: 'utf8' }));
const header = 'graph [bgcolor="white", fontname="PingFang SC", fontsize=20, pad="0.3", nodesep="0.4", ranksep="0.6"]; node [shape=box, style="rounded,filled", fillcolor="#f4f7fa", color="#536473", fontname="PingFang SC", fontsize=14, margin="0.18,0.13"]; edge [color="#536473", arrowsize=0.7];';
const dot = `digraph CPM { rankdir=LR; ${header}\nlabel="剩余交付计划的工程网络图（天）\\n红色：关键活动；ES/EF 为最早时间，LS/LF 为最迟时间"; labelloc=t;\n` + calc.cpm.activities.map(a => `${a.id} [label="${a.id} ${a.name}\\n持续 ${a.days} 天 | TF=${a.float}\\nES=${a.es} EF=${a.ef} | LS=${a.ls} LF=${a.lf}", color="${a.float===0?'#ab423f':'#536473'}", fillcolor="${a.float===0?'#fff0ed':'#f4f7fa'}"];`).join('\n') + '\n' + inputs.activities.flatMap(a=>a.after.map(p=>`${p} -> ${a.id};`)).join('\n') + '\n}';
writeFileSync(join(out, 'critical-path.dot'), dot);
execFileSync('dot', ['-Tpng', '-Gdpi=130', join(out,'critical-path.dot'), '-o', join(out,'critical-path.png')]);
const hierarchy = `digraph Modules { rankdir=TB; ${header}
label="模块结构图：组成层次（箭头表示分解）"; labelloc=t;
system [label="Wylie 学生选课系统"];
web [label="apps/web\n三角色 SPA"];
api [label="apps/api\nHTTP 与业务处理"];
sim [label="apps/simulators\n目录与计费测试替身"];
shared [label="packages\n共享契约与数据库"];
system -> {web api sim shared};
web -> {student professor registrar};
student [label="学生页面"]; professor [label="教授页面"]; registrar [label="教务页面"];
api -> {auth modules runtime rules};
auth [label="auth\n身份、会话、CSRF"];
modules [label="modules\ncatalog / schedules / teaching\npeople / imports / terms / billing"];
runtime [label="runtime\ngate / locks / clock\nexternal / startup / polling"];
rules [label="rules.ts\n数量、冲突、先修、金额"];
shared -> {contracts db}; contracts [label="contracts\nDTO 与 Zod 校验"]; db [label="db\nPrisma、迁移、seed"];
sim -> external; external [label="目录快照、计费确认\n故障控制与持久化"];
}`;
const moduleDir = join(root,'docs/design-docs/images');
writeFileSync(join(moduleDir,'C01-module-structure.dot'),hierarchy);
execFileSync('dot',['-Tpng','-Gdpi=150',join(moduleDir,'C01-module-structure.dot'),'-o',join(moduleDir,'C01-module-structure.png')]);
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const rows=[
 ['原计划 IT-01','2026-09-19','2026-09-25','#44769b','需求、设计与最小链路'],
 ['原计划 IT-02','2026-09-26','2026-10-02','#44769b','学生主链路与基础管理'],
 ['原计划 IT-03','2026-10-03','2026-10-09','#44769b','关闭、计费、成绩与集成'],
 ['原计划 IT-04','2026-10-10','2026-10-16','#44769b','回归、材料与交付'],
 ['团队说明：需求讨论','2026-09-09','2026-10-03','#9099a3','活动区间来自团队说明'],
 ['Git：需求／选型记录',null,null,'#2e7f68','09-09、09-22 两个记录点'],
 ['Git：集中设计与实现','2026-10-05','2026-10-05','#2e7f68','集中入库日'],
 ['记录：测试及修复','2026-10-05','2026-10-09','#2e7f68','按测试报告记录区间'],
 ['本轮：课程方法补充','2026-10-09','2026-10-09','#2e7f68','源材料提前推进']
];
const base=Date.parse('2026-09-09T00:00:00Z'), day=86400000;
const x=date=>300+(Date.parse(date+'T00:00:00Z')-base)/day*27;
const width=1390,height=750;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><g font-family="PingFang SC" fill="#253443"><text x="36" y="49" font-size="26" font-weight="600">计划与产物记录：2026-09-09—10-16</text><text x="36" y="83" font-size="16">蓝色为原计划；绿色为仓库记录；灰色为团队说明。区间不代表逐日投入或完成验收。</text>`;
for(const date of ['2026-09-09','2026-09-12','2026-09-19','2026-09-26','2026-10-03','2026-10-10','2026-10-16']){
 svg+=`<line x1="${x(date)}" x2="${x(date)}" y1="130" y2="655" stroke="#dbe2e6"/><text x="${x(date)}" y="119" font-size="14" text-anchor="middle">${date.slice(5)}</text>`;
}
rows.forEach(([name,start,end,color,note],i)=>{
 const y=155+i*55;
 svg+=`<text x="36" y="${y+17}" font-size="17">${xml(name)}</text>`;
 if(start) svg+=`<rect x="${x(start)}" y="${y}" width="${x(end)-x(start)+25}" height="27" fill="${color}" rx="3"/>`;
 else for(const date of ['2026-09-09','2026-09-22']) svg+=`<circle cx="${x(date)+12}" cy="${y+14}" r="8" fill="${color}"/>`;
 svg+=`<text x="300" y="${y+45}" font-size="12" fill="#596671">${xml(note)}</text>`;
});
svg+=`<line x1="${x('2026-10-09')+13}" x2="${x('2026-10-09')+13}" y1="130" y2="665" stroke="#a33e3d" stroke-dasharray="6 5"/><text x="${x('2026-10-09')+13}" y="693" text-anchor="middle" font-size="15" fill="#a33e3d">统计截止：10-09</text><text x="36" y="732" font-size="14">来源：开发计划 v0.3、Git 历史、测试报告及组长问卷；会议状态不在本图范围内。</text></g></svg>`;
writeFileSync(join(out,'plan-and-evidence.svg'),svg);
execFileSync('rsvg-convert',['--background-color=white','--output',join(out,'plan-and-evidence.png'),join(out,'plan-and-evidence.svg')]);
console.log('Generated plan-and-evidence.png, critical-path.png and C01-module-structure.png');
