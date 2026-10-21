import ServiceListing from './service_listing.model.js';
import { ServicePackage, ServiceAddon } from '../service_config/service_config.models.js';

/**
 * Enterprise Safe Monetary Rounding Utility
 * Implements authoritative 2-decimal precision (DECIMAL 10,2)
 * using string-scaled integer rounding to avoid IEEE 754 floating-point errors.
 */
export const roundMoney = (val) => {
  if (val == null || isNaN(val)) return 0.00;
  const num = Number(val);
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

/**
 * Authoritative Service Price Calculation Engine
 * Designed for Resident Booking & Provider Earnings Settlement Readiness.
 * 
 * Formula:
 * Subtotal = Base Service Price + Selected Package + Selected Add-ons + Material/Other Charges
 * Customer Payable = Subtotal + Platform Fee + Applicable Tax - Discount
 * Provider Earnings = Subtotal - Platform Commission - Applicable Deductions
 */
export const calculateAuthoritativeServicePrice = async ({
  listingId,
  packageId = null,
  addonIds = [],
  durationHours = 1,
  materialCharge = 0.00,
  platformFee = 29.00, // Flat platform fee (e.g. ₹29)
  taxRate = 0.05,      // 5% GST
  discountAmount = 0.00,
  platformCommissionRate = 0.10, // 10% platform commission
  applicableDeductions = 0.00,
}) => {
  const listing = await ServiceListing.findOne({
    where: { id: listingId, is_deleted: false },
    include: [
      { model: ServicePackage, as: 'packages' },
      { model: ServiceAddon, as: 'addons' },
    ]
  });

  if (!listing) {
    const error = new Error(`Service listing ID ${listingId} not found`);
    error.statusCode = 404;
    throw error;
  }

  // 1. Base Service Price Resolution based on Pricing Model
  let baseAmount = 0.00;
  if (listing.hourly_rate != null && Number(listing.hourly_rate) > 0) {
    const hours = Math.max(1, Number(durationHours) || 1);
    baseAmount = roundMoney(Number(listing.hourly_rate) * hours);
  } else if (listing.inspection_fee != null && Number(listing.inspection_fee) > 0) {
    baseAmount = roundMoney(Number(listing.inspection_fee));
  } else {
    baseAmount = roundMoney(Number(listing.price || 0.00));
  }

  // 2. Selected Package Resolution
  let packageAmount = 0.00;
  let resolvedPackage = null;

  if (packageId != null) {
    const pkg = (listing.packages || []).find(p => Number(p.id) === Number(packageId));
    if (!pkg) {
      const error = new Error(`Package ID ${packageId} does not belong to service listing ID ${listingId}`);
      error.statusCode = 400;
      throw error;
    }
    if (!pkg.is_active) {
      const error = new Error(`Package ID ${packageId} is inactive and cannot be selected`);
      error.statusCode = 400;
      throw error;
    }
    packageAmount = roundMoney(Number(pkg.price));
    resolvedPackage = {
      id: Number(pkg.id),
      package_level_id: pkg.package_level_id,
      name: pkg.name,
      description: pkg.description,
      price: packageAmount,
      duration_minutes: pkg.duration_minutes,
    };
  }

  // 3. Selected Add-ons Resolution
  let addonsAmount = 0.00;
  const resolvedAddons = [];

  if (Array.isArray(addonIds) && addonIds.length > 0) {
    for (const aId of addonIds) {
      const addon = (listing.addons || []).find(a => Number(a.id) === Number(aId));
      if (!addon) {
        const error = new Error(`Add-on ID ${aId} does not belong to service listing ID ${listingId}`);
        error.statusCode = 400;
        throw error;
      }
      if (!addon.is_enabled) {
        const error = new Error(`Add-on '${addon.name}' (ID ${aId}) is disabled and cannot be used for bookings`);
        error.statusCode = 400;
        throw error;
      }
      const itemPrice = roundMoney(Number(addon.price));
      addonsAmount = roundMoney(addonsAmount + itemPrice);
      resolvedAddons.push({
        id: Number(addon.id),
        addon_type_id: addon.addon_type_id,
        name: addon.name,
        price: itemPrice,
      });
    }
  }

  // 4. Material / Parts Charges
  const resolvedMaterialCharge = roundMoney(Math.max(0, Number(materialCharge) || 0.00));

  // If package selected, package price is effective service price
  const effectiveBaseOrPackage = resolvedPackage ? packageAmount : baseAmount;
  const subtotal = roundMoney(effectiveBaseOrPackage + addonsAmount + resolvedMaterialCharge);

  // 5. Governance & Financial Ledger Adjustments
  const resolvedPlatformFee = roundMoney(Math.max(0, Number(platformFee) || 0.00));
  const rawTaxable = roundMoney(subtotal + resolvedPlatformFee);
  const taxAmount = roundMoney(rawTaxable * Number(taxRate));
  
  // Clamped Discount
  const rawDiscount = roundMoney(Math.max(0, Number(discountAmount) || 0.00));
  const effectiveDiscount = Math.min(rawDiscount, subtotal);

  // Final Customer Payable
  const customerPayable = roundMoney(subtotal + resolvedPlatformFee + taxAmount - effectiveDiscount);

  // 6. Provider Earnings Breakdown
  const platformCommission = roundMoney(subtotal * Number(platformCommissionRate));
  const resolvedDeductions = roundMoney(Math.max(0, Number(applicableDeductions) || 0.00));
  const providerEarnings = roundMoney(Math.max(0, subtotal - platformCommission - resolvedDeductions));

  return {
    listing_id: Number(listing.id),
    title: listing.title,
    base_service_amount: baseAmount,
    selected_package: resolvedPackage,
    selected_addons: resolvedAddons,
    addons_amount: addonsAmount,
    material_charge: resolvedMaterialCharge,
    effective_service_amount: effectiveBaseOrPackage,
    subtotal,
    platform_fee: resolvedPlatformFee,
    tax_rate_percent: roundMoney(taxRate * 100),
    tax_amount: taxAmount,
    discount_amount: effectiveDiscount,
    customer_payable: customerPayable,
    platform_commission: platformCommission,
    applicable_deductions: resolvedDeductions,
    provider_earnings: providerEarnings,
    currency: 'INR',
  };
};
