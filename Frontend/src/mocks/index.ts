import type { Business, CashSnapshot, CashflowEntry, CashflowForecast, Customer, Invoice } from '../lib/businessData'

export const DEMO_DATE = '2026-10-25'
export const demoBusiness: Business = { id: 'demo-chavan-sons', name: 'Chavan and Sons' }

export const demoCustomers: Customer[] = [
  ['cust-mehta','Mehta Traders','27AABCM1234F1Z5'],['cust-sharma','Sharma Enterprises','27AABCS5678G1Z2'],['cust-rk','RK Distributors','27AAECR9012H1Z8'],['cust-verma','Verma & Co.','27AAGFV3456J1Z1'],['cust-gupta','Gupta Retailers','27AABCG7890K1Z6'],['cust-agarwal','Agarwal Supplies','27AAMFA2345L1Z3'],['cust-khan','Khan Wholesale','27AAFPK6789M1Z9'],['cust-patil','Patil & Sons','27AABFP0123N1Z4'],['cust-singh','Singh Enterprises','27AALFS4567P1Z7'],['cust-patel','Patel Industries','27AAECP8901Q1Z2'],
].map(([id,name,tax_id],i)=>({id,name,...(id==='cust-patil'?{}:{tax_id}),email:`accounts${i+1}@example.test`,phone:`+91 90000 100${String(i).padStart(2,'0')}`}))

type Seed = [string,string,number,number,number,string,string]
const seeds: Seed[] = [
 ['INV-2026-001','cust-mehta',185000,185000,0,'2026-09-02','2026-10-02'],['INV-2026-002','cust-sharma',142500,50000,92500,'2026-09-10','2026-10-10'],['INV-2026-003','cust-rk',98000,0,98000,'2026-09-18','2026-10-18'],['INV-2026-004','cust-verma',125000,0,125000,'2026-10-01','2026-10-31'],['INV-2026-005','cust-gupta',76200,0,76200,'2026-10-05','2026-11-04'],['INV-2026-006','cust-agarwal',218000,100000,118000,'2026-09-25','2026-10-25'],['INV-2026-007','cust-khan',164000,0,164000,'2026-10-08','2026-11-07'],['INV-2026-008','cust-patil',89000,89000,0,'2026-09-12','2026-10-12'],['INV-2026-009','cust-singh',134500,0,134500,'2026-10-12','2026-11-11'],['INV-2026-010','cust-patel',245000,0,245000,'2026-10-15','2026-12-14'],['INV-2026-011','cust-mehta',56000,0,56000,'2026-10-18','2026-12-17'],['INV-2026-012','cust-sharma',112000,0,112000,'2026-10-20','2026-12-19'],
]
const descriptions = ['Industrial fasteners and fittings','Packaging materials','Wholesale electrical components','Monthly supply order']
export const demoInvoices: Invoice[] = seeds.map(([number,customer,total,paid,due,issue,dueDate],i)=>{
 const taxable=Math.round(total/1.18), tax=total-taxable
 return { id:`demo-${number}`,invoice_number:number,status:paid===total?'paid':paid?'partially_paid':'issued',customer_id:customer,issue_date:issue,due_date:dueDate,total_paise:total*100,paid_amount_paise:paid*100,outstanding_paise:due*100,currency:'INR',created_at:`${issue}T10:00:00.000Z`,invoice_items:[{id:`line-${i}`,description:descriptions[i%descriptions.length],quantity:1,unit_price_paise:taxable*100,subtotal_paise:taxable*100,tax_paise:tax*100,total_paise:total*100}] }
})
demoInvoices.push({id:'demo-INV-2026-013',invoice_number:'INV-2026-013',status:'draft',customer_id:'cust-patil',issue_date:'2026-10-22',due_date:'2026-11-21',total_paise:8500000,paid_amount_paise:0,outstanding_paise:0,currency:'INR',created_at:'2026-10-22T11:00:00.000Z',invoice_items:[{id:'line-12',description:'Custom packaging and labels',quantity:1,unit_price_paise:7200000,subtotal_paise:7200000,tax_paise:1300000,total_paise:8500000}]})
demoInvoices.push({id:'demo-INV-2026-014',invoice_number:'INV-2026-014',status:'issued',customer_id:'cust-patil',issue_date:'2026-10-21',due_date:'2026-11-20',total_paise:4500000,paid_amount_paise:0,outstanding_paise:4500000,currency:'INR',created_at:'2026-10-21T09:30:00.000Z',invoice_items:[{id:'line-13',description:'Retail display materials',quantity:1,unit_price_paise:3813600,subtotal_paise:3813600,tax_paise:686400,total_paise:4500000}]})
export interface DemoPayment {id:string;invoiceId:string;amountPaise:number;date:string;method:string;reference:string}
export const demoPayments:DemoPayment[] = demoInvoices.filter(i=>i.paid_amount_paise>0).map((i,index)=>({id:`payment-${index+1}`,invoiceId:i.id,amountPaise:i.paid_amount_paise,date:`2026-10-${String(20-index).padStart(2,'0')}`,method:'bank_transfer',reference:`DEMO-${String(index+1).padStart(4,'0')}`}))
export const getDemoPayments=()=>demoPayments
export const demoSnapshots: CashSnapshot[] = [{amount_paise:124500000,recorded_at:`${DEMO_DATE}T09:00:00.000Z`},{amount_paise:119000000,recorded_at:'2026-10-24T09:00:00.000Z'}]
const dayKey=(offset:number)=>{const d=new Date(`${DEMO_DATE}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)}
export const demoEntries: CashflowEntry[] = Array.from({length:365},(_,i)=>{
 const inflow=i%5===2,amount=(inflow?[42000,68500,32000,54000][i%4]:[28500,46000,19500,72000][i%4])*100
 const expenseCategory=['Inventory/Suppliers','Salaries & Payroll','Rent & Utilities','Other Expenses'][i%4]
 return {id:`movement-${i+1}`,direction:inflow?'inflow':'outflow',amount_paise:amount,due_date:dayKey(i+1),is_actual:false,category:inflow?(i%2?'Customer Collections':'Other Inflows'):expenseCategory,description:inflow?`Expected customer collection · ${demoCustomers[i%demoCustomers.length].name}`:['Supplier payment · raw materials','Payroll · monthly wages','Rent & utilities','Other operating expense'][i%4]}
})
export const demoForecast: CashflowForecast = (()=>{let balance=demoSnapshots[0].amount_paise;const dailyBalances=demoEntries.map(e=>{const inflow=e.direction==='inflow'?e.amount_paise:0,outflow=e.direction==='outflow'?e.amount_paise:0;balance+=inflow-outflow;return {date:e.due_date,actualInflowPaise:0,actualOutflowPaise:0,estimatedInflowPaise:inflow,estimatedOutflowPaise:outflow,projectedBalancePaise:balance}});const min=Math.min(...dailyBalances.map(d=>d.projectedBalancePaise));return {startingBalancePaise:demoSnapshots[0].amount_paise,horizonDays:365,dailyBalances,shortageDate:dailyBalances.find(d=>d.projectedBalancePaise<10000000)?.date??null,cashGapPaise:Math.max(0,10000000-min),isEstimate:true}})()
function recalculateDemoForecast(){let balance=demoSnapshots[0].amount_paise;demoForecast.startingBalancePaise=balance;demoForecast.dailyBalances=demoEntries.filter(e=>e.due_date>DEMO_DATE).map(e=>{const inflow=e.direction==='inflow'?e.amount_paise:0,outflow=e.direction==='outflow'?e.amount_paise:0;balance+=inflow-outflow;return {date:e.due_date,actualInflowPaise:0,actualOutflowPaise:0,estimatedInflowPaise:inflow,estimatedOutflowPaise:outflow,projectedBalancePaise:balance}});const min=Math.min(...demoForecast.dailyBalances.map(d=>d.projectedBalancePaise));demoForecast.shortageDate=demoForecast.dailyBalances.find(d=>d.projectedBalancePaise<10000000)?.date??null;demoForecast.cashGapPaise=Math.max(0,10000000-min)}

let invoices=[...demoInvoices]
export const getDemoInvoices=()=>invoices
export function resetDemoInvoices(){invoices=[...demoInvoices]}
export function createDemoInvoice(input:{customerId:string;description:string;amountPaise:number;taxRateBps:number;issueDate:string;dueDate:string}):Invoice{
 const subtotal=input.amountPaise,tax=Math.round(subtotal*input.taxRateBps/10000),total=subtotal+tax, n=invoices.length+1,number=`INV-2026-${String(n).padStart(3,'0')}`
 const item={id:`line-${number}`,description:input.description,quantity:1,unit_price_paise:subtotal,subtotal_paise:subtotal,tax_paise:tax,total_paise:total}
 const invoice:Invoice={id:`demo-${number}`,invoice_number:number,status:'draft',customer_id:input.customerId,issue_date:input.issueDate||DEMO_DATE,due_date:input.dueDate||DEMO_DATE,total_paise:total,paid_amount_paise:0,outstanding_paise:0,currency:'INR',created_at:`${DEMO_DATE}T12:00:00.000Z`,invoice_items:[item]};invoices=[invoice,...invoices];return invoice
}
export function recordDemoPayment(invoiceId:string,amountPaise:number,method='bank_transfer',reference=''){invoices=invoices.map(i=>i.id!==invoiceId?i:{...i,paid_amount_paise:i.paid_amount_paise+amountPaise,outstanding_paise:i.outstanding_paise-amountPaise,status:i.outstanding_paise===amountPaise?'paid':'partially_paid'});const invoice=invoices.find(i=>i.id===invoiceId)!;demoPayments.push({id:`payment-demo-${demoPayments.length+1}`,invoiceId,amountPaise,date:DEMO_DATE,method,reference});demoSnapshots[0].amount_paise+=amountPaise;demoEntries.push({id:`movement-payment-${demoPayments.length}`,direction:'inflow',amount_paise:amountPaise,due_date:DEMO_DATE,is_actual:true,category:'Customer Collections',description:`Demo payment received · ${invoice.invoice_number}`});recalculateDemoForecast();return invoice}
