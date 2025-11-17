# Product Catalog Image Structure Guide

This document outlines the folder structure and naming conventions for all product images in the comprehensive catalog system.

## Directory Structure

```
/images/
├── products/                    # Product catalog thumbnail images (300x300px recommended)
│   ├── polo/
│   │   ├── classic-polo.jpg
│   │   ├── performance-polo.jpg
│   │   └── 2tone-polo.jpg
│   ├── cotton/
│   │   ├── vneck-tshirt.jpg
│   │   ├── round-tshirt.jpg
│   │   └── long-sleeve.jpg
│   ├── activewear/
│   │   ├── drifit-vneck.jpg
│   │   ├── drifit-crew.jpg
│   │   └── raglan.jpg
│   ├── jackets/
│   │   ├── pullup-jacket.jpg
│   │   └── zipper-jacket.jpg
│   ├── shorts/
│   │   └── drifit-short.jpg
│   ├── pants/
│   │   └── jogging-pants.jpg
│   ├── workwear/
│   │   └── scrub-suit.jpg
│   └── banner/
│       └── fabric-banner.jpg
│
├── V_Neck_T-Shirt/             # Existing customizer preview images (keep as-is)
│   ├── Green/
│   │   ├── V-Front_T-shirt.jpg
│   │   ├── V-Back_T-shirt.jpg
│   │   ├── V-LeftSleeve_T-shirt.jpg
│   │   └── V-RightSleeve_T-shirt.jpg
│   ├── Black/
│   └── White/
│
└── Round_Neck_T-Shirt/         # Existing customizer preview images (keep as-is)
    ├── Green/
    ├── Black/
    └── White/
```

## Image Requirements

### Product Catalog Images (`/images/products/`)
- **Purpose**: Display in product catalog modal for product selection
- **Dimensions**: 300x300px to 500x500px (square aspect ratio)
- **Format**: JPG or PNG
- **Background**: White or transparent background preferred
- **Content**: Front view of product, clean and professional

### Customizer Preview Images (Existing system)
- **Purpose**: Live preview in canvas area during customization
- **Dimensions**: Varies by garment type (typically 400x500px)
- **Format**: JPG with transparent areas for design overlay
- **Content**: Multiple angles (Front, Back, Sleeves, etc.)

## Product Categories and Codes

### All Shirts Category

#### Polo Shirt
- **Classic Polo Shirt** (PS-01) - ₱680
  - Image: `/images/products/polo/classic-polo.jpg`
  - Preview: Use existing polo preview system
  
- **Performance Polo Shirt** (PS-02) - ₱780
  - Image: `/images/products/polo/performance-polo.jpg`
  
- **2 Tone Polo Shirt** (PS-03) - ₱750
  - Image: `/images/products/polo/2tone-polo.jpg`

#### Cotton T-Shirt
- **V-Neck Cotton T-Shirt** (CT-01) - ₱530
  - Image: `/images/products/cotton/vneck-tshirt.jpg`
  - Preview: `/images/V_Neck_T-Shirt/{Color}/...`
  
- **Round Neck Cotton T-Shirt** (CT-02) - ₱630
  - Image: `/images/products/cotton/round-tshirt.jpg`
  - Preview: `/images/Round_Neck_T-Shirt/{Color}/...`
  
- **Long Sleeve Cotton Shirt** (CT-03) - ₱680
  - Image: `/images/products/cotton/long-sleeve.jpg`

#### Active Wear
- **Dri-Fit V-Neck Shirt** (DF-01) - ₱700
  - Image: `/images/products/activewear/drifit-vneck.jpg`
  
- **Dri-Fit Crew Neck Shirt** (DF-02) - ₱720
  - Image: `/images/products/activewear/drifit-crew.jpg`
  
- **Raglan Active Shirt** (RA-01) - ₱750
  - Image: `/images/products/activewear/raglan.jpg`

### Jackets Category

- **Pull-Up Jacket** (JK-01) - ₱950
  - Image: `/images/products/jackets/pullup-jacket.jpg`
  
- **Zipper Jacket** (JK-02) - ₱1050
  - Image: `/images/products/jackets/zipper-jacket.jpg`

### Shorts & Jogging Pants Category

- **Dri-Fit Athletic Shorts** (SH-01) - ₱550
  - Image: `/images/products/shorts/drifit-short.jpg`
  
- **Jogging Pants** (JP-01) - ₱650
  - Image: `/images/products/pants/jogging-pants.jpg`

### Workwear Category

- **Medical Scrub Suit** (WW-01) - ₱850
  - Image: `/images/products/workwear/scrub-suit.jpg`

### Banner Category

- **Fabric Banner** (BN-01) - ₱450/sqm
  - Image: `/images/products/banner/fabric-banner.jpg`

## Image Preparation Tips

1. **Consistency**: All product catalog images should have similar lighting and background
2. **Quality**: Use high-resolution images (at least 300 DPI) to ensure clarity
3. **Cropping**: Maintain square aspect ratio with product centered
4. **File Size**: Optimize images to 50-200KB each for faster loading
5. **Naming**: Use lowercase with hyphens (kebab-case) for consistency

## Fallback System

The product catalog modal includes a fallback mechanism:
- If an image fails to load, it displays a placeholder via placeholder.com
- Format: `https://via.placeholder.com/300x300?text={Product Name}`
- This ensures the UI remains functional even without all images

## Future Expansion

When adding new products:
1. Create product entry in `productCatalog` array in `customize-jersey-new.html`
2. Add image to appropriate `/images/products/{category}/` folder
3. Update `garmentType` enum in `CustomOrder.js` model if new type
4. Add location mappings in `locations` object if custom placement needed
5. Create customizer preview images if interactive preview needed

## Testing Checklist

- [ ] All product catalog images load correctly in modal
- [ ] Fallback placeholders appear for missing images
- [ ] Product selection updates preview correctly
- [ ] Backend accepts new garmentType values
- [ ] Image paths are correct (no 404 errors in console)
- [ ] Images display properly on different screen sizes
- [ ] Loading times are acceptable (< 3 seconds per modal open)

## Quick Setup

To populate images quickly for testing:

```bash
# Create all directories
mkdir -p images/products/{polo,cotton,activewear,jackets,shorts,pants,workwear,banner}

# Use placeholder images temporarily
# The system will automatically show placeholders for missing images
```

## Notes

- The existing `/images/V_Neck_T-Shirt/` and `/images/Round_Neck_T-Shirt/` folders are for the customizer preview system and should be preserved
- Product catalog images are separate from preview images
- Preview images require multiple angles (Front, Back, Sleeves), while catalog images only need one representative photo
- Consider using a CDN for image hosting in production to improve load times
