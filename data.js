// Wellitas catalogue — from the Website Content Inventory (sections 4, 5 and refined copy 10.3–10.4).
// Prices in INR, inclusive of taxes. `photo: true` marks photographic images (cover-fit) vs. transparent pack shots.

const CATEGORIES = [
  { id: "green",  name: "Green tea",      blurb: "Light, fresh, everyday" },
  { id: "black",  name: "Black tea",      blurb: "Bold, smooth, versatile" },
  { id: "herbal", name: "Herbal blends",  blurb: "Hibiscus, mint and lemongrass infusions" },
  { id: "ctc",    name: "SipAmrit CTC",   blurb: "Strong chai for milk-tea lovers" },
  { id: "seeds",  name: "Fruit & seeds",  blurb: "Snacks and toppings" },
  { id: "gifts",  name: "Gift hampers",   blurb: "Gift wellness. Gift happiness." },
];

const GREEN_BREW = ["Add 1 tsp of tea to 150–180 ml of water at 80–85°C", "Steep for 2–3 minutes", "Strain and enjoy warm", "Add lemon or honey if you like"];
const CTC_BREW = ["Boil 1 cup of water", "Add 1 tsp of tea and simmer for 2–3 minutes", "Add milk and sugar to taste", "Boil for one more minute, strain and serve hot"];
const HAMPER_FOR = ["Corporate and client gifting", "Employee appreciation", "Festivals", "Celebrations", "Friends and family"];

const PRODUCTS = [
  {
    slug: "himalayan-green-tea", name: "Himalayan Green Tea", brand: "Wellitas", cats: ["green"],
    size: "100 g", code: "HGT", price: 185, mrp: 369, img: "packs/green-front.png", back: "packs/green-back.png",
    pitch: "A clean, fresh green tea with gentle grassy notes, grown on Himalayan slopes. Light enough for every day, with a calm, mindful finish.",
    taste: "Clean · vegetal · delicate aroma",
    brew: GREEN_BREW,
    why: ["A refreshing coffee alternative", "Naturally rich in tea antioxidants", "Pairs well with a light breakfast"],
  },
  {
    slug: "hibiscus-green-tea", name: "Hibiscus Green Tea", brand: "Wellitas", cats: ["green", "herbal"],
    size: "100 g", price: 230, mrp: 459, img: "packs/hibiscus-green-front.png", back: "packs/hibiscus-green-back.png",
    pitch: "Smooth green tea meets ruby hibiscus petals: floral, lightly tangy, lovely hot or over ice.",
    taste: "Floral · lightly tangy · bright",
    brew: ["Add 1 tsp of tea to just-boiled water", "Steep for 3–4 minutes", "Strain", "Drink warm or chilled, plain or with a little honey"],
    why: ["Bright ruby colour in the cup", "Refreshing tartness", "A light, uplifting cup"],
  },
  {
    slug: "mint-lemongrass-green-tea", name: "Pure Mint Lemongrass Green Tea", short: "Mint Lemongrass Green Tea", brand: "Wellitas", cats: ["green", "herbal"],
    size: "100 g", code: "PMLGT", price: 199, mrp: 399, img: "packs/mint-green-front.png", back: "packs/mint-green-back.png",
    pitch: "Cooling mint and zesty lemongrass over a smooth green tea base, made for fresh mornings and easy evenings.",
    taste: "Cooling · citrusy · smooth",
    brew: GREEN_BREW,
    why: ["Crisp, citrusy and soothing", "A good after-meal cup", "Energising mornings, calm evenings"],
  },
  {
    slug: "hibiscus-black-tea", name: "Hibiscus Black Tea", brand: "Wellitas", cats: ["black", "herbal"],
    size: "100 g", code: "HBT", price: 275, mrp: 549, img: "packs/hibiscus-black-front.png", back: "packs/hibiscus-black-back.png",
    pitch: "Bold black tea with tart hibiscus for a deep ruby cup and a gently tangy finish. Strong enough for a proper brew, bright enough to serve iced.",
    taste: "Bold · tart · deep ruby",
    brew: ["Add 1 tsp of tea to boiling water", "Steep for 3–4 minutes", "Strain", "Serve hot or chilled, with honey or lemon if you like"],
    why: ["Rich colour and aroma", "Balances strength with florals", "Works hot or iced"],
  },
  {
    slug: "mint-lemongrass-black-tea", name: "Pure Mint Lemongrass Black Tea", short: "Mint Lemongrass Black Tea", brand: "Wellitas", cats: ["black", "herbal"],
    size: "100 g", code: "PMLBT", price: 249, mrp: 499, img: "packs/min-black-front.png", back: "packs/min-black-back.png",
    pitch: "Bold black tea lifted with mint and lemongrass: an energising cup that is just as good over ice.",
    taste: "Bold · minty · zesty",
    brew: [...GREEN_BREW.slice(0, 3), "Lemon or honey optional; also great as iced tea"],
    why: ["Fresh aroma", "Easy to drink", "A pleasant afternoon pick-me-up"],
  },
  {
    slug: "sipamrit-premium-ctc-250g", name: "Premium Extra Long Leaf CTC Tea", short: "SipAmrit Premium CTC", brand: "SipAmrit", cats: ["ctc"],
    size: "250 g", code: "PELCTC", price: 139, mrp: 199, img: "packs/sip-premium-front.png", back: "packs/sip-premium-back.png",
    pitch: "Longer CTC granules for a deep amber cup with a rounder aroma and a smooth, strong finish. For people who are particular about their chai.",
    taste: "Robust · amber · lingering",
    brew: CTC_BREW,
    why: ["Robust colour", "Lingering taste", "A premium upgrade at a small price step"],
  },
  {
    slug: "sipamrit-delight-ctc-250g", name: "Delight Standard Quality CTC Tea", short: "SipAmrit Delight CTC", brand: "SipAmrit", cats: ["ctc"],
    size: "250 g", code: "DSQCTC", price: 105, mrp: 150, img: "packs/sip-delight-front.png", back: "packs/sip-delight-back.png",
    pitch: "Your reliable daily chai. Crush-Tear-Curl grains give a strong colour, bold aroma and a brisk taste that stands up to milk.",
    taste: "Strong · brisk · full-bodied",
    brew: CTC_BREW,
    why: ["Consistent and energising", "Great value", "Made for milk chai"],
  },
  {
    slug: "sipamrit-delight-ctc-850g", name: "Delight Standard Quality CTC Tea", short: "SipAmrit Delight CTC 850 g", brand: "SipAmrit", cats: ["ctc"],
    size: "850 g", code: "DSQCTC", price: 349, mrp: 499, img: "packs/sip-delight-front.png", back: "packs/sip-delight-back.png", tag: "Value pack",
    pitch: "The value pack of our everyday chai: strong colour, bold aroma and a brisk taste that stands up to milk. Suits families and offices.",
    taste: "Strong · brisk · full-bodied",
    brew: CTC_BREW,
    why: ["Best price per cup", "Sized for families and offices", "The same dependable daily chai"],
  },
  {
    slug: "pure-super-seeds-mix", name: "Pure Super Seeds Mix", brand: "Wellitas", cats: ["seeds"],
    size: "100 g", code: "PSSM", price: 99, mrp: 125, img: "seeds-mix.jpg", photo: true,
    pitch: "Small seeds, big everyday goodness. A simple seed blend for everyday crunch: sprinkle on smoothie bowls, yoghurt, salads and oats, or snack on a handful.",
    taste: "Nutty · crunchy",
    useTitle: "How to enjoy",
    brew: ["Eat a handful on its own", "Sprinkle over smoothies and breakfast bowls", "Top yoghurt and salads", "Take it to the office or on the go"],
    why: ["Versatile for snacks and meals", "Adds a nutritious crunch", "Easy to carry"],
  },
  {
    slug: "natural-dried-fruit-mix", name: "Natural Dried Fruit Mix", brand: "Wellitas", cats: ["seeds"],
    size: "100 g", code: "NDFM", price: 99, mrp: 125, img: "fruit-mix.jpg", photo: true,
    pitch: "Naturally fruity, delightfully convenient. Chewy, fruity and easy to carry: eat it from the pack, stir it into cereal or oatmeal, or toss it into trail mix.",
    taste: "Fruity · chewy",
    useTitle: "How to enjoy",
    brew: ["Eat straight from the pack", "Stir into cereal or oatmeal", "Toss into trail mixes", "Use in desserts"],
    why: ["A convenient daily snack", "Fruity flavour and texture", "Good for home, office, travel or sharing"],
  },
  {
    slug: "premium-wellness-gift-hamper", name: "Premium Wellness Gift Hamper", brand: "Wellitas", cats: ["gifts"],
    size: "10 × 10 in box", code: "PWGH", price: 1249, mrp: 1699, img: "hamper-premium.jpg", back: "hamper-closed.jpg", photo: true,
    pitch: "A calm, elegant gift of tea, fruit, candles and handmade chocolates in a premium 10 × 10 inch gift box.",
    taste: "Wellness · relaxation · indulgence",
    useTitle: "What’s inside",
    brew: ["Hibiscus Green Tea, 100 g", "Pure Mint Lemongrass Green Tea, 100 g", "Natural Dried Fruit Mix, 100 g", "2 premium scented candles", "5 handmade premium chocolates"],
    whyTitle: "Perfect for",
    why: HAMPER_FOR,
  },
  {
    slug: "signature-wellness-gift-hamper", name: "Signature Wellness Gift Hamper", brand: "Wellitas", cats: ["gifts"],
    size: "10 × 10 in box", code: "SWGH", price: 1499, mrp: 1999, img: "hamper-signature.jpg", back: "hamper-closed.jpg", photo: true, tag: "Our fullest box",
    pitch: "Our fullest hamper: three green teas, seeds and dried fruit, plus scented candles and handmade chocolates in a premium 10 × 10 inch gift box.",
    taste: "Wellness · relaxation · indulgence",
    useTitle: "What’s inside",
    brew: ["Hibiscus Green Tea, 100 g", "Pure Mint Lemongrass Green Tea, 100 g", "Himalayan Green Tea, 100 g", "Pure Super Seeds Mix, 100 g", "Natural Dried Fruit Mix, 100 g", "2 premium scented candles", "5 handmade premium chocolates"],
    whyTitle: "Perfect for",
    why: HAMPER_FOR,
  },
];

const WHATSAPP = "919910973302";
const rupees = n => "₹" + n.toLocaleString("en-IN");
const offPct = p => Math.round((1 - p.price / p.mrp) * 100);
const catName = id => (CATEGORIES.find(c => c.id === id) || {}).name || "";
const productUrl = p => `product.html?p=${p.slug}`;
const imgSrc = f => (/^(\/|https?:)/.test(f) ? f : `assets/img/${f}`);
