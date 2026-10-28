/**
 * SINGLE SOURCE OF TRUTH FOR PRICING.
 * The browser never decides the price: it only sends planId/term/seats/coupon and the
 * server recomputes the amount here. The subscription page reads these numbers from /api/plans.
 *
 * >>> EDIT THE PRICES BELOW (INR, whole rupees). They are PLACEHOLDERS. <<<
 */
const PLANS = {
  pro: {
    name: 'Pro Plan',
    tagline: 'Crafted for Individuals',
    seats: 1,
    price: { quarterly: 4999, yearly: 14999 },
  },
  team: {
    name: 'Team Plan',
    tagline: 'Crafted for small teams or business',
    baseSeats: 5,
    maxSeats: 50,
    price: { quarterly: 14999, yearly: 54999 }, // includes baseSeats
    extraSeat: { quarterly: 1499, yearly: 5499 }, // per additional seat
  },
  business: {
    name: 'Business Pro',
    tagline: 'For Big Teams',
    seats: 20,
    price: { quarterly: 29999, yearly: 99999 },
  },
};

const TERMS = {
  quarterly: { months: 3, label: 'Quarterly' },
  yearly: { months: 12, label: 'Yearly' },
};

// Percent off. Validated on the server only.
const COUPONS = {
  '30KCELEB': 30,
  ZONEPRO: 10,
  WELCOME: 15,
};

function couponPercent(code) {
  if (!code) return 0;
  return COUPONS[String(code).trim().toUpperCase()] || 0;
}

/**
 * Returns amounts in PAISE (Razorpay's unit) or throws an Error with .status = 400.
 */
function computePrice({ planId, term, seats, couponCode }) {
  const plan = PLANS[planId];
  const termInfo = TERMS[term];
  if (!plan || !termInfo) {
    const e = new Error('Invalid plan or term');
    e.status = 400;
    throw e;
  }

  let finalSeats;
  let subtotalRupees = plan.price[term];

  if (planId === 'team') {
    finalSeats = Number.isInteger(seats) ? seats : plan.baseSeats;
    if (finalSeats < plan.baseSeats || finalSeats > plan.maxSeats) {
      const e = new Error(`Team seats must be between ${plan.baseSeats} and ${plan.maxSeats}`);
      e.status = 400;
      throw e;
    }
    subtotalRupees += (finalSeats - plan.baseSeats) * plan.extraSeat[term];
  } else {
    finalSeats = plan.seats;
  }

  const percent = couponPercent(couponCode);
  const subtotal = subtotalRupees * 100;
  const discount = Math.round((subtotal * percent) / 100);
  const total = subtotal - discount;

  return {
    planId,
    planName: plan.name,
    term,
    months: termInfo.months,
    seats: finalSeats,
    couponCode: percent ? String(couponCode).trim().toUpperCase() : '',
    discountPercent: percent,
    subtotalPaise: subtotal,
    discountPaise: discount,
    totalPaise: total,
  };
}

function publicCatalog() {
  return { currency: 'INR', plans: PLANS, terms: TERMS };
}

module.exports = { PLANS, TERMS, COUPONS, couponPercent, computePrice, publicCatalog };
