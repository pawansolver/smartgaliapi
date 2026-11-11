/**
 * Enterprise Category Specifications and Dynamic Attribute Template Registry
 * Defines category hierarchies, subcategories, dynamic product specification attributes,
 * units, and variant options for SmartGali eCommerce.
 */

export const CATEGORY_TEMPLATES = {
  Fashion: {
    category: 'Fashion',
    subcategories: [
      'Menswear',
      'Womenswear',
      'Kids Wear',
      'Ethnic Wear',
      'Footwear & Accessories',
      'Innerwear',
    ],
    suggested_units: ['Piece', 'Pair', 'Set', 'Pack of 2', 'Pack of 3'],
    specifications: [
      {
        key: 'gender',
        label: 'Gender',
        type: 'dropdown',
        required: true,
        options: ['Men', 'Women', 'Unisex', 'Boys', 'Girls'],
        placeholder: 'Select target gender',
      },
      {
        key: 'fabric',
        label: 'Fabric / Material',
        type: 'dropdown',
        required: false,
        options: [
          '100% Cotton',
          'Polyester',
          'Denim',
          'Silk',
          'Linen',
          'Rayon',
          'Wool',
          'Cotton Blend',
        ],
        placeholder: 'Select fabric material',
      },
      {
        key: 'pattern',
        label: 'Pattern',
        type: 'dropdown',
        required: false,
        options: [
          'Solid / Plain',
          'Printed',
          'Striped',
          'Checked',
          'Floral',
          'Embroidered',
          'Graphic',
        ],
        placeholder: 'Select pattern style',
      },
      {
        key: 'fit_type',
        label: 'Fit Type',
        type: 'dropdown',
        required: false,
        options: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Oversized', 'Tailored'],
        placeholder: 'Select fit type',
      },
      {
        key: 'neck_style',
        label: 'Neck / Collar Style',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. Round Neck, Mandarin Collar, V-Neck, Polo Collar',
      },
    ],
    suggested_variant_types: ['Size', 'Color', 'Fit'],
    suggested_variant_values: {
      Size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
      Color: ['Black', 'White', 'Navy Blue', 'Grey', 'Red', 'Olive Green', 'Beige', 'Maroon'],
    },
  },
  Electronics: {
    category: 'Electronics',
    subcategories: [
      'Smart Phones',
      'Laptops & PCs',
      'Audio & Headphones',
      'Smart Watches & Wearables',
      'Cameras',
      'Accessories',
      'Home Appliances',
    ],
    suggested_units: ['Piece', 'Unit', 'Set'],
    specifications: [
      {
        key: 'model_series',
        label: 'Model / Series',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. Galaxy S24, iPhone 15, Pavilion 15',
      },
      {
        key: 'connectivity',
        label: 'Connectivity',
        type: 'dropdown',
        required: false,
        options: [
          'Bluetooth & Wi-Fi',
          'Bluetooth Only',
          'Wi-Fi Only',
          'Wired',
          'USB-C',
          '5G / 4G LTE',
        ],
        placeholder: 'Select connectivity options',
      },
      {
        key: 'warranty_period',
        label: 'Warranty Period',
        type: 'dropdown',
        required: false,
        options: [
          '1 Year Manufacturer Warranty',
          '2 Years Manufacturer Warranty',
          '6 Months Warranty',
          'No Warranty',
        ],
        placeholder: 'Select warranty coverage',
      },
      {
        key: 'power_source',
        label: 'Power Source',
        type: 'dropdown',
        required: false,
        options: [
          'Rechargeable Battery',
          'Corded Electric',
          'Battery Powered (AA/AAA)',
          'Solar Powered',
        ],
        placeholder: 'Select power source',
      },
      {
        key: 'voltage_battery',
        label: 'Voltage / Battery Capacity',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. 5000 mAh, 65W Fast Charging, 220V',
      },
    ],
    suggested_variant_types: ['Storage', 'RAM', 'Color'],
    suggested_variant_values: {
      Storage: ['64GB', '128GB', '256GB', '512GB', '1TB'],
      RAM: ['4GB', '6GB', '8GB', '12GB', '16GB', '32GB'],
      Color: ['Midnight Black', 'Space Grey', 'Silver', 'Starlight Gold', 'Ocean Blue'],
    },
  },
  Grocery: {
    category: 'Grocery',
    subcategories: [
      'Staples & Grains',
      'Snacks & Munchies',
      'Dairy & Bakery',
      'Beverages',
      'Cooking Oil & Ghee',
      'Spices & Masala',
      'Personal Care',
    ],
    suggested_units: ['Kg', 'Gram', 'Litre', 'Millilitre', 'Pack', 'Bottle', 'Piece', 'Pouch'],
    specifications: [
      {
        key: 'food_preference',
        label: 'Food Preference',
        type: 'dropdown',
        required: false,
        options: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Egg'],
        placeholder: 'Select dietary preference',
      },
      {
        key: 'organic_certified',
        label: 'Organic Certified',
        type: 'dropdown',
        required: false,
        options: ['Yes', 'No'],
        placeholder: 'Is this product organic certified?',
      },
      {
        key: 'net_weight',
        label: 'Net Content / Weight',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. 500g, 1 kg, 5 Litres, Pack of 4',
      },
      {
        key: 'shelf_life',
        label: 'Shelf Life',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. 6 Months from packaging, 12 Months',
      },
    ],
    suggested_variant_types: ['Weight', 'Pack Size', 'Flavor'],
    suggested_variant_values: {
      Weight: ['100g', '250g', '500g', '1kg', '2kg', '5kg', '10kg'],
      'Pack Size': ['Single Pack', 'Pack of 2', 'Pack of 3', 'Family Pack'],
      Flavor: ['Classic / Original', 'Masala', 'Salted', 'Sweet', 'Mint'],
    },
  },
  Furniture: {
    category: 'Furniture',
    subcategories: [
      'Living Room',
      'Bedroom',
      'Dining',
      'Office Furniture',
      'Outdoor',
      'Storage & Wardrobes',
    ],
    suggested_units: ['Piece', 'Set'],
    specifications: [
      {
        key: 'primary_material',
        label: 'Primary Material',
        type: 'dropdown',
        required: false,
        options: [
          'Solid Wood (Sheesham / Teak)',
          'Engineered Wood',
          'Metal / Stainless Steel',
          'Leatherette',
          'Fabric Upholstery',
          'Plastic / Polymer',
        ],
        placeholder: 'Select primary material',
      },
      {
        key: 'assembly_required',
        label: 'Assembly Required',
        type: 'dropdown',
        required: false,
        options: [
          'Pre-assembled (Ready to Use)',
          'DIY / Basic Assembly Required',
          'Carpenter Assembly Provided by Seller',
        ],
        placeholder: 'Select assembly type',
      },
      {
        key: 'dimensions',
        label: 'Dimensions (L x W x H)',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. 180cm x 90cm x 75cm (71 x 35 x 30 in)',
      },
      {
        key: 'finish_polish',
        label: 'Finish / Polish',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. Matte Walnut, High Gloss White, Honey Teak',
      },
    ],
    suggested_variant_types: ['Finish', 'Seater', 'Color'],
    suggested_variant_values: {
      Finish: ['Walnut Finish', 'Teak Finish', 'Natural Oak', 'Glossy White', 'Matte Black'],
      Seater: ['1 Seater', '2 Seater', '3 Seater', '4 Seater', '6 Seater', '8 Seater'],
    },
  },
  Footwear: {
    category: 'Footwear',
    subcategories: [
      'Sports Shoes',
      'Casual Shoes',
      'Formal Shoes',
      'Sandals & Floaters',
      'Slippers & Flip-Flops',
      'Boots',
    ],
    suggested_units: ['Pair', 'Piece'],
    specifications: [
      {
        key: 'outer_material',
        label: 'Outer Material',
        type: 'dropdown',
        required: false,
        options: [
          'Genuine Leather',
          'Synthetic Leather',
          'Mesh / Breathable Knit',
          'Canvas',
          'Rubber / PVC',
        ],
        placeholder: 'Select outer material',
      },
      {
        key: 'sole_material',
        label: 'Sole Material',
        type: 'dropdown',
        required: false,
        options: ['Rubber', 'EVA', 'TPR (Thermoplastic Rubber)', 'PU (Polyurethane)', 'Phylon'],
        placeholder: 'Select sole material',
      },
      {
        key: 'closure_type',
        label: 'Closure Type',
        type: 'dropdown',
        required: false,
        options: ['Lace-Up', 'Slip-On', 'Hook & Loop / Velcro', 'Zipper', 'Buckle'],
        placeholder: 'Select closure mechanism',
      },
      {
        key: 'toe_shape',
        label: 'Toe Shape',
        type: 'dropdown',
        required: false,
        options: ['Round Toe', 'Pointed Toe', 'Square Toe'],
        placeholder: 'Select toe shape',
      },
    ],
    suggested_variant_types: ['UK / India Size', 'Color'],
    suggested_variant_values: {
      'UK / India Size': ['UK 5', 'UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11', 'UK 12'],
      Color: ['Black', 'White', 'Navy Blue', 'Brown', 'Tan', 'Grey'],
    },
  },
  Beauty: {
    category: 'Beauty',
    subcategories: [
      'Skincare',
      'Haircare',
      'Makeup',
      'Fragrances & Deodorants',
      'Bath & Body',
      'Men\'s Grooming',
    ],
    suggested_units: ['Piece', 'Bottle', 'Tube', 'Jar', 'Pack', 'Box'],
    specifications: [
      {
        key: 'skin_hair_type',
        label: 'Skin / Hair Type',
        type: 'dropdown',
        required: false,
        options: [
          'All Skin Types',
          'Dry Skin / Hair',
          'Oily Skin / Hair',
          'Sensitive Skin',
          'Combination Skin',
          'Normal',
        ],
        placeholder: 'Select skin or hair type compatibility',
      },
      {
        key: 'formulation',
        label: 'Formulation',
        type: 'dropdown',
        required: false,
        options: ['Cream', 'Gel', 'Liquid', 'Serum', 'Powder', 'Lotion', 'Oil'],
        placeholder: 'Select formulation type',
      },
      {
        key: 'organic_natural',
        label: 'Organic / Natural',
        type: 'dropdown',
        required: false,
        options: [
          '100% Organic',
          'Herbal / Ayurvedic',
          'Dermatologically Tested',
          'Chemical Free / Paraben Free',
          'Standard Commercial',
        ],
        placeholder: 'Select certification standard',
      },
    ],
    suggested_variant_types: ['Volume', 'Shade', 'Skin Type'],
    suggested_variant_values: {
      Volume: ['30ml', '50ml', '100ml', '200ml', '500ml'],
      Shade: ['Fair / Porcelain', 'Ivory', 'Beige', 'Sand', 'Warm Honey', 'Caramel', 'Deep Bronze'],
    },
  },
  Hardware: {
    category: 'Hardware',
    subcategories: [
      'Power Tools',
      'Hand Tools',
      'Electrical Supplies',
      'Plumbing & Pipes',
      'Fasteners & Fixtures',
      'Paints & Primers',
      'Safety Equipment',
    ],
    suggested_units: ['Piece', 'Box', 'Meter', 'Roll', 'Kg', 'Pack', 'Set', 'Litre'],
    specifications: [
      {
        key: 'tool_type',
        label: 'Tool / Item Type',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. Drill Machine, Wrench, PVC Ball Valve, Emulsion Paint',
      },
      {
        key: 'material_grade',
        label: 'Material / Grade',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. Chrome Vanadium Steel, CPVC Schedule 40, High Tensile Brass',
      },
      {
        key: 'usage_application',
        label: 'Usage Application',
        type: 'dropdown',
        required: false,
        options: ['Domestic / DIY', 'Commercial Use', 'Heavy Industrial'],
        placeholder: 'Select usage application level',
      },
    ],
    suggested_variant_types: ['Size / Gauge', 'Pack Qty', 'Color / Finish'],
    suggested_variant_values: {
      'Size / Gauge': ['1/2 inch', '3/4 inch', '1 inch', '2 inch', '10mm', '12mm', '16mm'],
      'Pack Qty': ['Piece', 'Pack of 10', 'Pack of 50', 'Box of 100'],
    },
  },
  General: {
    category: 'General',
    subcategories: [
      'General Merchandise',
      'Household Essentials',
      'Gifts & Novelties',
      'Stationeries',
    ],
    suggested_units: ['Piece', 'Unit', 'Box', 'Pack', 'Set'],
    specifications: [
      {
        key: 'material_composition',
        label: 'Material / Composition',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. Plastic, Steel, Paper, Glass',
      },
      {
        key: 'usage_type',
        label: 'Usage Type',
        type: 'text',
        required: false,
        options: [],
        placeholder: 'e.g. Daily Use, Indoor, Decorative',
      },
    ],
    suggested_variant_types: ['Size', 'Color'],
    suggested_variant_values: {
      Size: ['Small', 'Medium', 'Large'],
      Color: ['Assorted', 'Standard'],
    },
  },
};

/**
 * Normalize category name or lookup from template registry
 */
export const getCategoryTemplate = (categoryName) => {
  if (!categoryName) return CATEGORY_TEMPLATES.General;
  const normalized = Object.keys(CATEGORY_TEMPLATES).find(
    (key) => key.toLowerCase() === categoryName.toString().trim().toLowerCase()
  );
  return normalized ? CATEGORY_TEMPLATES[normalized] : CATEGORY_TEMPLATES.General;
};

/**
 * Return all category templates
 */
export const getAllCategoryTemplates = () => {
  return Object.values(CATEGORY_TEMPLATES);
};
