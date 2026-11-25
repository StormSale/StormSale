import { describe, it, expect, beforeEach, afterEach } from "vitest";

interface VoucherCode {
  code: string;
  type: "fixed" | "percentage";
  value: number;
  expiresAt: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface DiscountResult {
  success: boolean;
  discountAmount: number;
  finalTotal: number;
  error?: string;
}

class VoucherService {
  private vouchers: Map<string, VoucherCode> = new Map();
  private cache: Map<string, VoucherCode | null> = new Map();

  constructor(vouchers: VoucherCode[]) {
    vouchers.forEach((v) => this.vouchers.set(v.code.toUpperCase(), v));
  }

  formatVoucherCode(input: string): string {
    return input.trim().toUpperCase().replace(/\s+/g, "");
  }

  getVoucher(code: string): VoucherCode | null {
    const formatted = this.formatVoucherCode(code);
    if (this.cache.has(formatted)) return this.cache.get(formatted)!;
    const voucher = this.vouchers.get(formatted) || null;
    this.cache.set(formatted, voucher);
    return voucher;
  }

  isExpired(voucher: VoucherCode): boolean {
    return Date.now() > voucher.expiresAt;
  }

  isExhausted(voucher: VoucherCode): boolean {
    return voucher.usedCount >= voucher.maxUses;
  }

  isInactive(voucher: VoucherCode): boolean {
    return !voucher.active;
  }

  applyVoucher(code: string, cartItems: CartItem[]): DiscountResult {
    const voucher = this.getVoucher(code);

    if (!voucher) {
      return { success: false, discountAmount: 0, finalTotal: this.getCartTotal(cartItems), error: "Invalid voucher code" };
    }

    if (this.isInactive(voucher)) {
      return { success: false, discountAmount: 0, finalTotal: this.getCartTotal(cartItems), error: "Voucher code is not active" };
    }

    if (this.isExpired(voucher)) {
      return { success: false, discountAmount: 0, finalTotal: this.getCartTotal(cartItems), error: "Voucher code has expired" };
    }

    if (this.isExhausted(voucher)) {
      return { success: false, discountAmount: 0, finalTotal: this.getCartTotal(cartItems), error: "Voucher code usage limit exceeded" };
    }

    const subtotal = this.getCartTotal(cartItems);
    let discountAmount = 0;

    if (voucher.type === "fixed") {
      discountAmount = Math.min(voucher.value, subtotal);
    } else {
      discountAmount = Math.min((subtotal * voucher.value) / 100, subtotal);
    }

    const finalTotal = Math.max(0, subtotal - discountAmount);

    return { success: true, discountAmount, finalTotal };
  }

  private getCartTotal(items: CartItem[]): number {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  clearCache() {
    this.cache.clear();
  }
}

describe("B2C Consumer Discount Voucher Redemption Tests", () => {
  let voucherService: VoucherService;

  const now = Date.now();
  const futureDate = now + 86400000 * 30;
  const pastDate = now - 86400000;

  const vouchers: VoucherCode[] = [
    {
      code: "SAVE10",
      type: "percentage",
      value: 10,
      expiresAt: futureDate,
      maxUses: 100,
      usedCount: 0,
      active: true,
    },
    {
      code: "SAVE150",
      type: "percentage",
      value: 150,
      expiresAt: futureDate,
      maxUses: 100,
      usedCount: 0,
      active: true,
    },
    {
      code: "FIXED5",
      type: "fixed",
      value: 5,
      expiresAt: futureDate,
      maxUses: 50,
      usedCount: 0,
      active: true,
    },
    {
      code: "EXPIRED",
      type: "percentage",
      value: 20,
      expiresAt: pastDate,
      maxUses: 100,
      usedCount: 0,
      active: true,
    },
    {
      code: "EXHAUSTED",
      type: "fixed",
      value: 10,
      expiresAt: futureDate,
      maxUses: 1,
      usedCount: 1,
      active: true,
    },
    {
      code: "INACTIVE",
      type: "percentage",
      value: 15,
      expiresAt: futureDate,
      maxUses: 100,
      usedCount: 0,
      active: false,
    },
  ];

  const cartItems: CartItem[] = [
    { id: "1", name: "Product A", price: 50, quantity: 2 },
    { id: "2", name: "Product B", price: 30, quantity: 1 },
  ];

  beforeEach(() => {
    voucherService = new VoucherService(vouchers);
    voucherService.clearCache();
  });

  afterEach(() => {
    voucherService.clearCache();
  });

  describe("Voucher Code Input Formatting", () => {
    it("transforms lowercase voucher codes to uppercase", () => {
      expect(voucherService.formatVoucherCode("save10")).toBe("SAVE10");
      expect(voucherService.formatVoucherCode("fixed5")).toBe("FIXED5");
    });

    it("removes whitespace from voucher codes", () => {
      expect(voucherService.formatVoucherCode("  SAVE 10 ")).toBe("SAVE10");
      expect(voucherService.formatVoucherCode(" FIXED 5 ")).toBe("FIXED5");
    });

    it("handles mixed case input", () => {
      expect(voucherService.formatVoucherCode("SaVe10")).toBe("SAVE10");
    });

    it("trims leading and trailing whitespace", () => {
      expect(voucherService.formatVoucherCode("  SAVE10  ")).toBe("SAVE10");
    });
  });

  describe("Discount Calculation - Fixed Amount", () => {
    it("applies fixed discount to cart subtotal", () => {
      const result = voucherService.applyVoucher("FIXED5", cartItems);
      expect(result.success).toBe(true);
      expect(result.discountAmount).toBe(5);
      expect(result.finalTotal).toBe(125);
    });

    it("caps fixed discount at cart subtotal", () => {
      const smallCart: CartItem[] = [{ id: "1", name: "Cheap Item", price: 3, quantity: 1 }];
      const result = voucherService.applyVoucher("FIXED5", smallCart);
      expect(result.success).toBe(true);
      expect(result.discountAmount).toBe(3);
      expect(result.finalTotal).toBe(0);
    });
  });

  describe("Discount Calculation - Percentage", () => {
    it("applies percentage discount to cart subtotal", () => {
      const result = voucherService.applyVoucher("SAVE10", cartItems);
      expect(result.success).toBe(true);
      expect(result.discountAmount).toBe(13);
      expect(result.finalTotal).toBe(117);
    });

    it("caps percentage discount at cart subtotal", () => {
      const smallCart: CartItem[] = [{ id: "1", name: "Item", price: 10, quantity: 1 }];
      const result = voucherService.applyVoucher("SAVE150", smallCart);
      expect(result.success).toBe(true);
      expect(result.discountAmount).toBe(10);
      expect(result.finalTotal).toBe(0);
    });
  });

  describe("Error Messages for Invalid Voucher Codes", () => {
    it("returns error for invalid voucher code", () => {
      const result = voucherService.applyVoucher("INVALID", cartItems);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid voucher code");
    });

    it("returns error for expired voucher code", () => {
      const result = voucherService.applyVoucher("EXPIRED", cartItems);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Voucher code has expired");
    });

    it("returns error for exhausted voucher code", () => {
      const result = voucherService.applyVoucher("EXHAUSTED", cartItems);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Voucher code usage limit exceeded");
    });

    it("returns error for inactive voucher code", () => {
      const result = voucherService.applyVoucher("INACTIVE", cartItems);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Voucher code is not active");
    });
  });

  describe("Case Insensitive Voucher Code Lookup", () => {
    it("accepts lowercase voucher code", () => {
      const result = voucherService.applyVoucher("save10", cartItems);
      expect(result.success).toBe(true);
    });

    it("accepts mixed case voucher code", () => {
      const result = voucherService.applyVoucher("SaVe10", cartItems);
      expect(result.success).toBe(true);
    });
  });
});
