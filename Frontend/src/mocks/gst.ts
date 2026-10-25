export { demoInvoices, demoCustomers } from './index'
export interface PurchaseRecord {date:string;number:string;vendor:string;gstin:string;taxable:number;tax:number;status:'Matched'|'Missing in GSTR-2B'|'Value mismatch'|'Duplicate entry'}
export const demoPurchaseRecords:PurchaseRecord[]=[
 {date:'2026-10-03',number:'PUR-2026-041',vendor:'Pune Packaging Mart',gstin:'27AAEFP4567A1Z8',taxable:68000,tax:12240,status:'Matched'},
 {date:'2026-10-11',number:'PUR-2026-057',vendor:'Western Steel Depot',gstin:'27AAAFW8912B1Z4',taxable:92500,tax:16650,status:'Missing in GSTR-2B'},
 {date:'2026-10-17',number:'PUR-2026-069',vendor:'Metro Logistics',gstin:'27AABFM3456C1Z2',taxable:24500,tax:4410,status:'Matched'},
]
