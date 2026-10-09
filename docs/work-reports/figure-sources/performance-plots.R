args <- commandArgs(trailingOnly = FALSE)
script <- sub("^--file=", "", args[grepl("^--file=", args)])
source_dir <- dirname(normalizePath(script))
report_dir <- dirname(source_dir)
ink <- "#24364b"
muted <- "#64748b"
green <- "#26756a"
blue <- "#355f87"
red <- "#ad4c43"
font <- "PingFang SC"

canvas <- function(title, subtitle) {
  par(mar = c(0,0,0,0), family = font, fg = ink, xpd = NA)
  plot.new()
  plot.window(xlim = c(0,1200), ylim = c(700,0), xaxs = "i", yaxs = "i")
  text(48, 48, title, adj = c(0,.5), cex = 2, font = 2)
  text(48, 96, subtitle, adj = c(0,.5), cex = 1.13, col = muted)
}
render <- function(person, name, draw) {
  folder <- file.path(report_dir, person, "attachments")
  dir.create(folder, recursive = TRUE, showWarnings = FALSE)
  png(file.path(folder, paste0(name,".png")), width = 2400, height = 1400, res = 200, type = "quartz", bg = "white")
  draw()
  dev.off()
  svg(file.path(folder, paste0(name,".svg")), width = 12, height = 7, family = font, bg = "white")
  draw()
  dev.off()
}

stages <- read.csv(file.path(source_dir,"refresh-stages.csv"), fileEncoding = "UTF-8")
render("nichengjin", "figure-refresh-stages", function() {
  canvas("三轮目录刷新短测结果", "同一 Linux 环境 · 2000 用户 · 30 秒预热＋180 秒测量 · 独立客户端、API、模拟进程")
  start <- 365
  width <- 680
  ys <- c(232,365,498)
  bar_colors <- c("#8b9daf","#528889",green)
  ratio <- stages$success / stages$total * 100
  for(i in 1:3) {
    rect(start,ys[i]-28,start+width,ys[i]+28,col="#edf1f5",border=NA)
    rect(start,ys[i]-28,start+width*ratio[i]/100,ys[i]+28,col=bar_colors[i],border=NA)
    text(48,ys[i]-11,paste0("第",c("一","二","三")[i],"轮"),adj=0,cex=1.22,font=2)
    text(48,ys[i]+24,stages$label[i],adj=0,cex=1.15)
    text(start+width*ratio[i]/100+15,ys[i],sprintf("%.2f%%",ratio[i]),adj=0,cex=1.38,font=2)
    text(start,ys[i]+54,paste0(format(stages$success[i],big.mark=",")," / ",format(stages$total[i],big.mark=",")," 笔交易"),adj=0,cex=1.04,col=muted)
  }
  threshold <- start+width*.8
  segments(threshold,169,threshold,532,col=red,lty=2,lwd=1.6)
  text(threshold,145,"80% 要求",col=red,cex=1.1)
  for(tick in seq(0,100,20)) {
    x <- start+width*tick/100
    segments(x,577,x,584,col=muted)
    text(x,608,paste0(tick,"%"),cex=1,col=muted)
  }
  segments(start,577,start+width,577,col="#bac6d2")
  text(48,665,"分子：成功且在 120 秒内完成；分母：该轮测量阶段发起的全部交易。",adj=0,cex=1.08,col=muted)
})

outcomes <- read.csv(file.path(source_dir,"load-outcomes.csv"), fileEncoding = "UTF-8")
stopifnot(sum(outcomes$count)==98252)
render("fenghailun", "figure-load-outcomes", function() {
  canvas("原 macOS 2000 用户长测：交易结果构成", "2026-10-06 · 5 分钟预热＋30 分钟测量 · 全部交易 98,252 笔")
  start <- 70
  width <- 1060
  pct <- outcomes$count / sum(outcomes$count) * 100
  parts <- c(green,"#bb8248",red)
  ends <- c(0,cumsum(pct))
  for(i in 1:3){
    a <- start+width*ends[i]/100
    b <- start+width*ends[i+1]/100
    rect(a,240,b,335,col=parts[i],border="white",lwd=2)
    text((a+b)/2,288,sprintf("%.2f%%",pct[i]),cex=1.55,col="white",font=2)
  }
  threshold <- start+width*.8
  segments(threshold,200,threshold,352,col=ink,lty=2,lwd=1.7)
  text(threshold,177,"120 秒内成功：80% 要求",cex=1.12)
  segments(start,368,start+width,368,col="#bac6d2")
  for(tick in seq(0,100,20))text(start+width*tick/100,396,paste0(tick,"%"),cex=1.03,col=muted)
  labels <- c("成功且在 120 秒内完成","客户端超时","网络错误")
  for(i in 1:3){
    x <- c(70,508,888)[i]
    rect(x,460,x+18,478,col=parts[i],border=NA)
    text(x+30,469,labels[i],adj=0,cex=1.14)
    text(x,519,paste0(format(outcomes$count[i],big.mark=",")," 笔"),adj=0,cex=1.62,font=2)
  }
  text(70,601,"API、数据库、模拟服务与压测端均在同一台 Mac；本图仅呈现该次原始结果。",adj=0,cex=1.08,col=muted)
  text(70,648,"超时和网络错误保留在全部交易中，不因后端稍后完成写入而改记成功。",adj=0,cex=1.08,col=muted)
})
