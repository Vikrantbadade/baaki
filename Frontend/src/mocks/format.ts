export const formatINR=(paise:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(paise/100)
export const formatDemoDate=(value:string)=>new Date(`${value.slice(0,10)}T00:00:00Z`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})
export const overdueDays=(due:string,reference='2026-10-25')=>Math.max(0,Math.floor((Date.parse(`${reference}T00:00:00Z`)-Date.parse(`${due}T00:00:00Z`))/86400000))
export const formatPercent=(value:number)=>`${value>0?'+':''}${value.toFixed(1)}%`
export const overdueLabel=(due:string)=>{const days=overdueDays(due);return days?`${days} days overdue`:'Not overdue'}
