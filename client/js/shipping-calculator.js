/**
 * Shipping Calculator - Distance-based pricing using OpenRouteService
 * Similar to Lalamove pricing model
 * 
 * Store Location: Anabu Coastal, Imus, Cavite
 */

const ShippingCalculator = (function() {
  // OpenRouteService API Key
  const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImUzZTUyYTc2NDRhNjQyNDFiZmEyYzUyYmI3MDVmMDk0IiwiaCI6Im11cm11cjY0In0=';
  
  // Store coordinates (Anabu Coastal, Imus, Cavite)
  // Coordinates: approximately 14.4296° N, 120.9369° E
  const STORE_COORDS = {
    lat: 14.4296,
    lng: 120.9369
  };
  
  // Lalamove-style pricing tiers (for apparel/light items - motorcycle tier)
  const PRICING = {
    baseFare: 63,           // Base fare (first 4km included)
    baseDistance: 4,        // Kilometers included in base fare
    perKmRate: 15,          // Rate per additional km
    minFee: 63,             // Minimum delivery fee
    maxFee: 500,            // Maximum delivery fee cap
    pickupFee: 0            // Pickup is free
  };
  
  // Zone-based fallback rates (when API fails or for quick estimates)
  const ZONE_RATES = {
    'metro_manila': { base: 120, label: 'Metro Manila' },
    'cavite': { base: 70, label: 'Cavite' },
    'laguna': { base: 80, label: 'Laguna' },
    'rizal': { base: 85, label: 'Rizal' },
    'bulacan': { base: 90, label: 'Bulacan' },
    'pampanga': { base: 100, label: 'Pampanga' },
    'batangas': { base: 120, label: 'Batangas' },
    'nueva_ecija': { base: 120, label: 'Nueva Ecija' },
    'tarlac': { base: 130, label: 'Tarlac' },
    'zambales': { base: 140, label: 'Zambales' },
    'bataan': { base: 140, label: 'Bataan' },
    'quezon_province': { base: 150, label: 'Quezon Province' },
    'other_luzon': { base: 180, label: 'Other Luzon' },
    'visayas': { base: 250, label: 'Visayas' },
    'mindanao': { base: 300, label: 'Mindanao' }
  };
  
  // Province to zone mapping
  const PROVINCE_ZONES = {
    // Metro Manila / NCR
    'metro manila': 'metro_manila',
    'manila': 'metro_manila',
    'quezon city': 'metro_manila',
    'makati': 'metro_manila',
    'pasig': 'metro_manila',
    'taguig': 'metro_manila',
    'mandaluyong': 'metro_manila',
    'pasay': 'metro_manila',
    'paranaque': 'metro_manila',
    'parañaque': 'metro_manila',
    'las pinas': 'metro_manila',
    'las piñas': 'metro_manila',
    'muntinlupa': 'metro_manila',
    'marikina': 'metro_manila',
    'san juan': 'metro_manila',
    'valenzuela': 'metro_manila',
    'malabon': 'metro_manila',
    'navotas': 'metro_manila',
    'caloocan': 'metro_manila',
    'pateros': 'metro_manila',
    
    // CALABARZON
    'cavite': 'cavite',
    'laguna': 'laguna',
    'batangas': 'batangas',
    'rizal': 'rizal',
    'quezon': 'quezon_province',
    
    // Central Luzon
    'bulacan': 'bulacan',
    'pampanga': 'pampanga',
    'nueva ecija': 'nueva_ecija',
    'tarlac': 'tarlac',
    'zambales': 'zambales',
    'bataan': 'bataan',
    'aurora': 'other_luzon',
    
    // Ilocos Region
    'pangasinan': 'other_luzon',
    'la union': 'other_luzon',
    'ilocos norte': 'other_luzon',
    'ilocos sur': 'other_luzon',
    
    // Cordillera
    'benguet': 'other_luzon',
    'baguio': 'other_luzon',
    'mountain province': 'other_luzon',
    'ifugao': 'other_luzon',
    'kalinga': 'other_luzon',
    'apayao': 'other_luzon',
    'abra': 'other_luzon',
    
    // Bicol
    'camarines norte': 'other_luzon',
    'camarines sur': 'other_luzon',
    'albay': 'other_luzon',
    'sorsogon': 'other_luzon',
    'catanduanes': 'other_luzon',
    'masbate': 'other_luzon',
    
    // Visayas
    'cebu': 'visayas',
    'bohol': 'visayas',
    'negros oriental': 'visayas',
    'negros occidental': 'visayas',
    'iloilo': 'visayas',
    'capiz': 'visayas',
    'aklan': 'visayas',
    'antique': 'visayas',
    'guimaras': 'visayas',
    'leyte': 'visayas',
    'southern leyte': 'visayas',
    'samar': 'visayas',
    'eastern samar': 'visayas',
    'northern samar': 'visayas',
    'biliran': 'visayas',
    'siquijor': 'visayas',
    
    // Mindanao
    'davao': 'mindanao',
    'davao del sur': 'mindanao',
    'davao del norte': 'mindanao',
    'davao oriental': 'mindanao',
    'davao occidental': 'mindanao',
    'davao de oro': 'mindanao',
    'zamboanga': 'mindanao',
    'zamboanga del norte': 'mindanao',
    'zamboanga del sur': 'mindanao',
    'zamboanga sibugay': 'mindanao',
    'bukidnon': 'mindanao',
    'misamis oriental': 'mindanao',
    'misamis occidental': 'mindanao',
    'lanao del norte': 'mindanao',
    'lanao del sur': 'mindanao',
    'north cotabato': 'mindanao',
    'south cotabato': 'mindanao',
    'sultan kudarat': 'mindanao',
    'sarangani': 'mindanao',
    'general santos': 'mindanao',
    'cagayan de oro': 'mindanao',
    'agusan del norte': 'mindanao',
    'agusan del sur': 'mindanao',
    'surigao del norte': 'mindanao',
    'surigao del sur': 'mindanao',
    'dinagat islands': 'mindanao',
    'basilan': 'mindanao',
    'sulu': 'mindanao',
    'tawi-tawi': 'mindanao',
    'maguindanao': 'mindanao',
    'cotabato': 'mindanao',
    'compostela valley': 'mindanao'
  };
  
  /**
   * Get zone-based rate (fallback when distance calc fails)
   */
  function getZoneRate(province) {
    if (!province) return ZONE_RATES.metro_manila.base;
    
    const key = province.toLowerCase().trim();
    
    // Try direct match
    if (PROVINCE_ZONES[key]) {
      const zone = PROVINCE_ZONES[key];
      return ZONE_RATES[zone]?.base || 120;
    }
    
    // Try partial match
    for (const [prov, zone] of Object.entries(PROVINCE_ZONES)) {
      if (key.includes(prov) || prov.includes(key)) {
        return ZONE_RATES[zone]?.base || 120;
      }
    }
    
    return 120; // Default
  }
  
  /**
   * Geocode an address to coordinates using OpenRouteService
   */
  async function geocodeAddress(address) {
    try {
      const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}&boundary.country=PH&size=1`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Geocoding failed');
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const coords = data.features[0].geometry.coordinates;
        return {
          lng: coords[0],
          lat: coords[1],
          displayName: data.features[0].properties.label || address
        };
      }
      
      throw new Error('No results found');
    } catch (error) {
      console.warn('Geocoding error:', error.message);
      return null;
    }
  }
  
  /**
   * Calculate driving distance between two points using OpenRouteService
   */
  async function calculateDistance(fromCoords, toCoords) {
    try {
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${fromCoords.lng},${fromCoords.lat}&end=${toCoords.lng},${toCoords.lat}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Distance calculation failed');
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const properties = data.features[0].properties;
        const summary = properties.summary;
        
        return {
          distanceKm: Math.round((summary.distance / 1000) * 10) / 10, // Round to 1 decimal
          durationMinutes: Math.round(summary.duration / 60),
          durationText: formatDuration(summary.duration)
        };
      }
      
      throw new Error('No route found');
    } catch (error) {
      console.warn('Distance calculation error:', error.message);
      return null;
    }
  }
  
  /**
   * Format duration in seconds to readable string
   */
  function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} mins`;
  }
  
  /**
   * Calculate shipping fee based on distance (Lalamove-style)
   */
  function calculateFeeFromDistance(distanceKm) {
    let fee = PRICING.baseFare;
    
    // Add per-km rate for distance beyond base distance
    if (distanceKm > PRICING.baseDistance) {
      const additionalKm = distanceKm - PRICING.baseDistance;
      fee += additionalKm * PRICING.perKmRate;
    }
    
    // Round up to nearest peso
    fee = Math.ceil(fee);
    
    // Apply min/max caps
    fee = Math.max(fee, PRICING.minFee);
    fee = Math.min(fee, PRICING.maxFee);
    
    return fee;
  }
  
  /**
   * Main function: Calculate shipping fee for an address
   * Returns: { fee, distanceKm, durationText, method, success }
   */
  async function calculateShippingFee(addressComponents) {
    const { street, city, province, building, block, lot } = addressComponents;
    
    // Build full address string
    const addressParts = [block, lot, street, building, city, province, 'Philippines'].filter(Boolean);
    const fullAddress = addressParts.join(', ');
    
    // Check if pickup selected
    if (addressComponents.isPickup) {
      return {
        fee: PRICING.pickupFee,
        distanceKm: 0,
        durationText: 'Pick-up at store',
        method: 'pickup',
        success: true
      };
    }
    
    try {
      // Step 1: Geocode the customer address
      const customerCoords = await geocodeAddress(fullAddress);
      
      if (!customerCoords) {
        // Fallback to zone-based
        console.log('Geocoding failed, using zone-based rate for:', province);
        return {
          fee: getZoneRate(province),
          distanceKm: null,
          durationText: 'Estimated',
          method: 'zone-based',
          success: true,
          fallback: true
        };
      }
      
      // Step 2: Calculate distance from store to customer
      const distanceResult = await calculateDistance(STORE_COORDS, customerCoords);
      
      if (!distanceResult) {
        // Fallback to zone-based
        console.log('Distance calc failed, using zone-based rate for:', province);
        return {
          fee: getZoneRate(province),
          distanceKm: null,
          durationText: 'Estimated',
          method: 'zone-based',
          success: true,
          fallback: true
        };
      }
      
      // Step 3: Calculate fee based on distance
      const fee = calculateFeeFromDistance(distanceResult.distanceKm);
      
      return {
        fee: fee,
        distanceKm: distanceResult.distanceKm,
        durationText: distanceResult.durationText,
        method: 'distance-based',
        success: true
      };
      
    } catch (error) {
      console.error('Shipping calculation error:', error);
      
      // Fallback to zone-based
      return {
        fee: getZoneRate(province),
        distanceKm: null,
        durationText: 'Estimated',
        method: 'zone-based',
        success: true,
        fallback: true,
        error: error.message
      };
    }
  }
  
  /**
   * Quick estimate based on province only (no API call)
   */
  function getQuickEstimate(province) {
    return {
      fee: getZoneRate(province),
      method: 'zone-based',
      success: true
    };
  }
  
  /**
   * Get store location info
   */
  function getStoreLocation() {
    return {
      address: 'Anabu Coastal, Imus, Cavite',
      coordinates: STORE_COORDS
    };
  }
  
  /**
   * Get pricing info for display
   */
  function getPricingInfo() {
    return {
      baseFare: PRICING.baseFare,
      baseDistance: PRICING.baseDistance,
      perKmRate: PRICING.perKmRate,
      minFee: PRICING.minFee,
      maxFee: PRICING.maxFee
    };
  }
  
  // Public API
  return {
    calculateShippingFee,
    getQuickEstimate,
    getZoneRate,
    getStoreLocation,
    getPricingInfo,
    geocodeAddress,
    calculateDistance,
    calculateFeeFromDistance
  };
})();

// Make it available globally
window.ShippingCalculator = ShippingCalculator;
