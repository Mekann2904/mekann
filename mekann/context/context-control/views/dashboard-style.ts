export function dashboardStyle(): string {
  return `:root{--bg:#1a1b26;--surface:#24283b;--border:#3b4261;--text:#c0caf5;--dim:#565f89;--accent:#7aa2f7;--cyan:#7dcfff;--green:#9ece6a;--red:#f7768e;--orange:#ff9e64;--purple:#bb9af7;--heading:#c0caf5}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.5}
main{max-width:1280px;margin:0 auto;padding:24px}
h1{font-size:20px;font-weight:600;color:var(--heading);margin-bottom:4px}
h2{font-size:14px;font-weight:600;color:var(--heading);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.sub{color:var(--dim);font-size:12px;margin-bottom:20px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:16px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:0;padding:16px}
.panel h2{margin-top:0}
.graph{width:100%;background:#0f172a;border:1px solid var(--border);display:block}
.metric{font-size:24px;font-weight:700;color:var(--accent)}
.metric .delta{font-size:12px;font-weight:400;margin-left:6px}
.label{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
table{width:100%;border-collapse:collapse;font-size:12px}
td,th{padding:6px 10px;text-align:left;border-bottom:1px solid var(--border)}
th{color:var(--dim);font-weight:600;font-size:11px}
.bar{height:8px;background:#1e2030;border-radius:0;overflow:hidden;min-width:60px}
.bar span{display:block;height:100%;background:var(--accent)}
.trend-bar{display:inline-flex;flex-direction:column;align-items:center;width:18px;margin-right:2px;vertical-align:bottom}
.trend-bar span{display:block;width:12px;background:var(--accent)}
.trend-bar small{font-size:9px;color:var(--dim);margin-top:2px}
.legend{display:flex;gap:12px;margin-bottom:8px;font-size:11px}
.legend span{display:inline-flex;align-items:center;gap:4px}
.legend i{display:inline-block;width:10px;height:10px;border:1px solid var(--border)}
.tag{display:inline-block;border:1px solid var(--border);padding:2px 6px;margin:2px;font-size:11px;color:var(--text)}
.alert{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
.alert:last-child{border-bottom:none}
.alert .icon{font-weight:700}
.alert.warn .icon{color:var(--orange)}
.alert.info .icon{color:var(--accent)}
.warn{color:var(--orange)}
.ok{color:var(--green)}
.dim{color:var(--dim)}
.accent{color:var(--accent)}
a{color:var(--cyan);text-decoration:none}
a:hover{text-decoration:underline}
.nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px}
.nav a{border:1px solid var(--border);padding:6px 10px;background:var(--surface)}
.card-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.card-list .panel{display:block;color:var(--text)}
.card-list .panel strong{display:block;color:var(--heading);font-size:15px;margin-bottom:6px}
.spacer{height:20px}
@media(max-width:900px){.grid2,.grid3,.grid4{grid-template-columns:1fr}}`;
}
