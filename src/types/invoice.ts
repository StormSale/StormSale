/**
 * Invoice and billing types for B2B enterprise features
 */

export interface EnterpriseInvoiceData {
  invoiceId: string;
  invoiceDate: string;
  dueDate: string;
  enterpriseName: string;
  taxId: string;
  registrationNumber: string;
  businessAddress: BusinessAddress;
  billingPeriod: BillingPeriod;
  lineItems: LineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalEscrowSpent: number;
  paymentTerms: string;
  bankDetails: BankDetails;
}

export interface BusinessAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface BillingPeriod {
  startDate: string;
  endDate: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  sortCode: string;
}

export interface TaxInvoiceMetadata {
  complianceLevel: "standard" | "enhanced" | "advanced";
  currency: string;
  locale: string;
  digitalSignature?: string;
  archivedAt?: string;
}
