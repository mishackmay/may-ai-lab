const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

class WebsiteGenerator {
    constructor() {
        this.model = process.env.OLLAMA_MODEL || 'mistral';
        this.imageCache = new Map(); // Image cache for performance
    }

    async generate(businessDesc, userInputs = null) {
        try {
            const details = await this.parseWithAI(businessDesc, userInputs);
            console.log('=== GENERATED DETAILS ===');
            console.log('Name:', details.name);
            console.log('Type:', details.type);
            console.log('Location:', details.location);
            console.log('Services:', details.services);
            console.log('Primary Color:', details.primaryColor);
            console.log('Contact:', details.contact);
            console.log('=======================');
            const files = await this.createFiles(details);
            return files;
        } catch (error) {
            console.error('Generation error:', error);
            return { error: error.message };
        }
    }

    async parseWithAI(description, userInputs = null) {
        // If user provided custom inputs from the UI, use them directly
        if (userInputs && userInputs.name) {
            const finalType = userInputs.businessType || this.detectBusinessType(description);
            
            return {
                name: userInputs.name,
                type: finalType,
                location: userInputs.location || this.extractLocation(description),
                services: userInputs.services && userInputs.services.length >= 4 ? userInputs.services.slice(0,4) : this.getServicesByType(finalType),
                tagline: userInputs.tagline || this.getTaglineByType(finalType),
                primaryColor: userInputs.primaryColor || this.getColorByType(finalType),
                secondaryColor: userInputs.secondaryColor || this.getSecondaryColor(finalType),
                accentColor: '#FFFFFF',
                designStyle: this.getDesignStyle(finalType),
                mood: 'professional',
                imageStyle: 'photography',
                animationIntensity: 'moderate',
                contact: {
                    phone: userInputs.phone || '+27 79 123 4567',
                    email: userInputs.email || `info@${userInputs.name.toLowerCase().replace(/\s/g, '')}.com`,
                    whatsapp: userInputs.whatsapp || '+27 79 123 4567',
                    website: userInputs.website || ''
                },
                customAbout: userInputs.customAbout || null,
                serviceDescriptions: userInputs.serviceDescriptions || null
            };
        }
        
        // Fallback: Parse from description string (for backward compatibility)
        let userProvidedName = '';
        let userLocation = '';
        let userTagline = '';
        let userServices = [];
        let userPrimaryColor = '';
        let userSecondaryColor = '';
        let userBusinessType = '';
        let userPhone = '';
        let userEmail = '';
        let userWhatsapp = '';
        let userWebsite = '';
        let userCustomAbout = null;
        let userServiceDescriptions = null;
        
        // Extract user inputs from description
        const nameMatch = description.match(/BUSINESS NAME: "([^"]+)"/);
        if (nameMatch) userProvidedName = nameMatch[1];
        
        const locationMatch = description.match(/Located in ([^.]+)/);
        if (locationMatch) userLocation = locationMatch[1];
        
        const taglineMatch = description.match(/Tagline: ([^.]+)/);
        if (taglineMatch) userTagline = taglineMatch[1];
        
        const servicesMatch = description.match(/Services: ([^.]+)/);
        if (servicesMatch) userServices = servicesMatch[1].split(',').map(s => s.trim());
        
        const typeMatch = description.match(/Business type: ([^.]+)/);
        if (typeMatch) userBusinessType = typeMatch[1];
        
        const phoneMatch = description.match(/Phone: ([^,]+)/);
        if (phoneMatch) userPhone = phoneMatch[1].trim();
        
        const emailMatch = description.match(/Email: ([^,]+)/);
        if (emailMatch) userEmail = emailMatch[1].trim();
        
        const whatsappMatch = description.match(/WhatsApp: ([^,]+)/);
        if (whatsappMatch) userWhatsapp = whatsappMatch[1].trim();
        
        const websiteMatch = description.match(/Website: ([^,]+)/);
        if (websiteMatch) userWebsite = websiteMatch[1].trim();
        
        const aboutMatch = description.match(/About: "([^"]+)"/);
        if (aboutMatch) userCustomAbout = aboutMatch[1];
        
        // Determine final values (user input takes priority)
        let finalType = userBusinessType || this.detectBusinessType(description);
        let finalName = userProvidedName || this.extractName(description);
        let finalLocation = userLocation || this.extractLocation(description);
        let finalTagline = userTagline || this.getTaglineByType(finalType);
        let finalServices = userServices.length >= 4 ? userServices.slice(0,4) : this.getServicesByType(finalType);
        let finalPrimaryColor = userPrimaryColor || this.getColorByType(finalType);
        let finalSecondaryColor = userSecondaryColor || this.getSecondaryColor(finalType);
        
        return {
            name: finalName,
            type: finalType,
            location: finalLocation,
            services: finalServices,
            tagline: finalTagline,
            primaryColor: finalPrimaryColor,
            secondaryColor: finalSecondaryColor,
            accentColor: '#FFFFFF',
            designStyle: this.getDesignStyle(finalType),
            mood: 'professional',
            imageStyle: 'photography',
            animationIntensity: 'moderate',
            contact: {
                phone: userPhone || '+27 79 123 4567',
                email: userEmail || `info@${finalName.toLowerCase().replace(/\s/g, '')}.com`,
                whatsapp: userWhatsapp || '+27 79 123 4567',
                website: userWebsite || ''
            },
            customAbout: userCustomAbout || null,
            serviceDescriptions: userServiceDescriptions || null
        };
    }

    detectBusinessType(description) {
        const descLower = description.toLowerCase();
        
        const types = [
            { keywords: ['donut', 'doughnut', 'donuts', 'doughnuts', 'glazed', 'sprinkles', 'donut shop', 'doughnut shop'], type: 'Donut Shop' },
            { keywords: ['bakery', 'bread', 'cake', 'pastry', 'patisserie', 'baked goods', 'cupcake', 'croissant'], type: 'Bakery' },
            { keywords: ['coffee', 'cafe', 'espresso', 'latte', 'cappuccino', 'coffee shop', 'coffeehouse', 'tea shop', 'coffee bar'], type: 'Coffee Shop' },
            { keywords: ['restaurant', 'dining', 'eatery', 'bistro', 'grill', 'steakhouse', 'seafood', 'buffet', 'fine dining'], type: 'Restaurant' },
            { keywords: ['gym', 'fitness', 'workout', 'exercise', 'bodybuilding', 'crossfit', 'yoga', 'pilates', 'fitness center'], type: 'Gym' },
            { keywords: ['dating', 'match', 'relationship', 'dating app', 'dating site', 'matchmaking', 'love', 'romance'], type: 'Dating App' },
            { keywords: ['security', 'alarm', 'guard', 'surveillance', 'cctv', 'security system', 'armed response'], type: 'Security' },
            { keywords: ['pizza', 'pizzeria', 'pizza place', 'pizza shop', 'italian', 'wood fired'], type: 'Pizza Place' },
            { keywords: ['salon', 'hair', 'beauty', 'barber', 'haircut', 'hairstylist', 'manicure', 'pedicure'], type: 'Salon' },
            { keywords: ['spa', 'massage', 'wellness', 'sauna', 'aromatherapy', 'facial', 'day spa'], type: 'Spa' },
            { keywords: ['tech', 'software', 'app', 'development', 'it', 'technology', 'programming', 'coding', 'tech company'], type: 'Tech Company' },
            { keywords: ['plumbing', 'pipe', 'plumber', 'leak', 'faucet', 'toilet', 'drain', 'water heater'], type: 'Plumbing' },
            { keywords: ['cleaning', 'maid', 'janitor', 'housekeeping', 'house cleaning', 'cleaning service'], type: 'Cleaning Service' },
            { keywords: ['e-commerce', 'ecommerce', 'online store', 'shopify', 'online shop', 'retail'], type: 'E-commerce' },
            { keywords: ['real estate', 'realtor', 'property', 'house', 'home', 'apartment', 'realty'], type: 'Real Estate' },
            { keywords: ['auto repair', 'mechanic', 'car repair', 'automotive', 'garage', 'auto shop'], type: 'Auto Repair' },
            { keywords: ['pet store', 'pet shop', 'pet supplies', 'dog', 'cat', 'pet food', 'pet grooming'], type: 'Pet Store' },
            { keywords: ['fashion', 'clothing', 'apparel', 'boutique', 'fashion store', 'clothing store', 'dress'], type: 'Fashion Boutique' }
        ];
        
        for (const item of types) {
            for (const keyword of item.keywords) {
                if (descLower.includes(keyword)) {
                    return item.type;
                }
            }
        }
        return 'Business';
    }

    extractName(description) {
        const descLower = description.toLowerCase();
        
        const namePatterns = [
            /(?:named|called|brand|is)\s+([a-zA-Z\s]+?)(?:\s+(?:in|at|located|for|a|an|$))/i,
            /"([^"]+)"/,
            /'([^']+)'/
        ];
        
        for (const pattern of namePatterns) {
            const match = description.match(pattern);
            if (match && match[1]) {
                let name = match[1].trim();
                name = name.replace(/\s+(in|at|located|for|a|an)$/i, '');
                name = name.replace(/[.,'"]/g, '');
                if (name.length > 1) return name;
            }
        }
        
        if (descLower.includes('donut')) {
            const donutMatch = description.match(/([a-zA-Z\s]+?)\s+Donuts?/i);
            if (donutMatch && donutMatch[1]) {
                let name = donutMatch[1].trim();
                name = name.replace(/^(?:create|make|build|generate)\s+/i, '');
                if (name.length > 1) return name + " Donuts";
            }
        }
        
        if (descLower.includes('coffee')) {
            const coffeeMatch = description.match(/([a-zA-Z\s]+?)\s+Coffee/i);
            if (coffeeMatch && coffeeMatch[1]) {
                let name = coffeeMatch[1].trim();
                name = name.replace(/^(?:create|make|build|generate)\s+/i, '');
                if (name.length > 1) return name + " Coffee";
            }
        }
        
        if (descLower.includes('gym')) {
            const gymMatch = description.match(/([a-zA-Z\s]+?)\s+Gym/i);
            if (gymMatch && gymMatch[1]) {
                let name = gymMatch[1].trim();
                name = name.replace(/^(?:create|make|build|generate)\s+/i, '');
                if (name.length > 1) return name + " Gym";
            }
        }
        
        const words = description.split(' ');
        const stopWords = ['in', 'at', 'located', 'for', 'called', 'named', 'is', 'a', 'an'];
        let name = [];
        for (let i = 0; i < Math.min(3, words.length); i++) {
            if (stopWords.includes(words[i].toLowerCase())) break;
            name.push(words[i]);
        }
        
        return name.join(' ').replace(/[.,'"]/g, '') || 'My Business';
    }

    extractLocation(description) {
        const words = description.split(' ');
        const locationIndicators = ['in', 'at', 'located', 'from'];
        for (let i = 0; i < words.length; i++) {
            if (locationIndicators.includes(words[i].toLowerCase()) && words[i+1]) {
                return words.slice(i+1, Math.min(i+4, words.length)).join(' ').replace(/[.,'"]/g, '');
            }
        }
        return 'South Africa';
    }

    getDesignStyle(businessType) {
        const styles = {
            'Donut Shop': 'playful', 'Coffee Shop': 'cozy', 'Restaurant': 'elegant',
            'Gym': 'bold', 'Dating App': 'playful', 'Security': 'corporate',
            'Pizza Place': 'playful', 'Salon': 'elegant', 'Spa': 'calming',
            'Tech Company': 'modern', 'Bakery': 'cozy', 'Plumbing': 'professional',
            'Cleaning Service': 'professional', 'E-commerce': 'modern',
            'Real Estate': 'professional', 'Auto Repair': 'professional',
            'Pet Store': 'playful', 'Fashion Boutique': 'elegant', 'default': 'modern'
        };
        return styles[businessType] || styles.default;
    }

    getColorByType(businessType) {
        const colors = {
            'Donut Shop': '#D2691E', 'Coffee Shop': '#8B4513', 'Restaurant': '#E67E22',
            'Gym': '#27AE60', 'Dating App': '#FF1493', 'Security': '#1A2A3A',
            'Pizza Place': '#C41E3A', 'Salon': '#FF69B4', 'Spa': '#9B59B6',
            'Tech Company': '#3498DB', 'Bakery': '#F4A460', 'Plumbing': '#3498DB',
            'Cleaning Service': '#48C9B0', 'E-commerce': '#FF6B35', 'Real Estate': '#2874A6',
            'Auto Repair': '#DC7633', 'Pet Store': '#F39C12', 'Fashion Boutique': '#E91E63',
            'default': '#667EEA'
        };
        return colors[businessType] || colors.default;
    }

    getSecondaryColor(businessType) {
        const colors = {
            'Donut Shop': '#F4A460', 'Coffee Shop': '#D2691E', 'Restaurant': '#F39C12',
            'Gym': '#F39C12', 'Dating App': '#FF69B4', 'Security': '#E67E22',
            'Pizza Place': '#F4A460', 'Salon': '#FFB6C1', 'Spa': '#DDA0DD',
            'Tech Company': '#6C5CE7', 'Bakery': '#F4A460', 'Plumbing': '#F39C12',
            'Cleaning Service': '#48C9B0', 'E-commerce': '#F4D03F', 'Real Estate': '#F39C12',
            'Auto Repair': '#F39C12', 'Pet Store': '#F39C12', 'Fashion Boutique': '#FFB6C1',
            'default': '#8B5CF6'
        };
        return colors[businessType] || colors.default;
    }

    getServicesByType(type) {
        const servicesMap = {
            'Donut Shop': ['Fresh Donuts', 'Coffee & Tea', 'Pastries', 'Catering'],
            'Coffee Shop': ['Espresso', 'Pastries', 'Free WiFi', 'Catering'],
            'Restaurant': ['Fine Dining', 'Takeaway', 'Catering', 'Private Events'],
            'Gym': ['Personal Training', 'Group Classes', 'Nutrition Plans', 'Equipment Access'],
            'Dating App': ['Smart Matching', 'Profile Verification', 'Video Chat', 'Safety Tips'],
            'Security': ['24/7 Monitoring', 'Alarm Systems', 'CCTV Installation', 'Armed Response'],
            'Pizza Place': ['Pizza', 'Pasta', 'Salads', 'Delivery'],
            'Salon': ['Hair Styling', 'Manicure', 'Facials', 'Waxing'],
            'Spa': ['Massage', 'Facial Treatments', 'Body Wraps', 'Wellness Programs'],
            'Tech Company': ['Software Development', 'Cloud Solutions', 'IT Consulting', 'Support'],
            'Bakery': ['Fresh Bread', 'Cakes', 'Pastries', 'Custom Orders'],
            'Plumbing': ['Repairs', 'Installations', 'Emergency Service', 'Maintenance'],
            'Cleaning Service': ['Residential', 'Commercial', 'Deep Cleaning', 'Window Cleaning'],
            'E-commerce': ['Online Shopping', 'Fast Delivery', 'Secure Payments', '24/7 Support'],
            'Real Estate': ['Property Sales', 'Rentals', 'Property Management', 'Valuations'],
            'Auto Repair': ['Oil Change', 'Brake Service', 'Engine Repair', 'Diagnostics'],
            'Pet Store': ['Pet Food', 'Accessories', 'Grooming', 'Veterinary Services'],
            'Fashion Boutique': ['Clothing', 'Accessories', 'Personal Styling', 'Alterations'],
            'default': ['Consultation', 'Service 1', 'Service 2', 'Support']
        };
        return servicesMap[type] || servicesMap.default;
    }

    getTaglineByType(type) {
        const taglines = {
            'Donut Shop': 'Fresh donuts, happy moments',
            'Coffee Shop': 'Brewed with love, served with care',
            'Restaurant': 'Experience culinary excellence',
            'Gym': 'Transform your body, transform your life',
            'Dating App': 'Find your perfect match',
            'Security': 'Protecting what matters most',
            'Pizza Place': 'Hot & fresh, delivered fast',
            'Salon': 'Unleash your inner beauty',
            'Spa': 'Rejuvenate your mind, body, and soul',
            'Tech Company': 'Innovation at your fingertips',
            'Bakery': 'Fresh from the oven to your home',
            'Plumbing': 'Reliable service, guaranteed solutions',
            'Cleaning Service': 'Spotless spaces, happy faces',
            'E-commerce': 'Shop smarter, live better',
            'Real Estate': 'Your dream home awaits',
            'Auto Repair': 'Keep your car running smoothly',
            'Pet Store': 'Everything for your furry friends',
            'Fashion Boutique': 'Style that speaks volumes',
            'default': 'Excellence in everything we do'
        };
        return taglines[type] || taglines.default;
    }

    getIconForType(businessType) {
        const icons = {
            'Donut Shop': 'cookie-bite', 'Coffee Shop': 'mug-hot', 'Restaurant': 'utensils',
            'Gym': 'dumbbell', 'Dating App': 'heart', 'Security': 'shield-alt',
            'Pizza Place': 'pizza-slice', 'Salon': 'cut', 'Spa': 'spa',
            'Tech Company': 'laptop-code', 'Bakery': 'bread-slice', 'Plumbing': 'wrench',
            'Cleaning Service': 'broom', 'E-commerce': 'shopping-cart', 'Real Estate': 'home',
            'Auto Repair': 'car', 'Pet Store': 'paw', 'Fashion Boutique': 'tshirt',
            'default': 'store'
        };
        return icons[businessType] || icons.default;
    }

    getServiceIcon(service) {
        const icons = {
            'Donuts': 'cookie-bite', 'Coffee': 'mug-hot', 'Espresso': 'mug-hot',
            'Pastries': 'cookie-bite', 'Training': 'dumbbell', 'Matching': 'heart',
            'Pizza': 'pizza-slice', 'Hair': 'cut', 'Massage': 'hand-sparkles',
            'Software': 'code', 'Development': 'code', 'Cleaning': 'broom',
            'Shopping': 'shopping-cart', 'Repair': 'wrench', 'default': 'star'
        };
        for (const [key, icon] of Object.entries(icons)) {
            if (service.toLowerCase().includes(key.toLowerCase())) return icon;
        }
        return icons.default;
    }

    // ========== DYNAMIC IMAGE FUNCTIONS ==========

    async generateImageQueries(details, purpose = "hero") {
        const fetch = (await import('node-fetch')).default;
        
        const styleKeywords = {
            'modern': 'clean minimalist contemporary', 'elegant': 'luxury sophisticated refined',
            'playful': 'vibrant colorful fun energetic', 'cozy': 'warm inviting comfortable',
            'bold': 'dynamic powerful striking', 'corporate': 'professional sleek business',
            'calming': 'peaceful serene tranquil', 'minimalist': 'clean simple uncluttered'
        };
        const style = styleKeywords[details.designStyle] || 'professional high-quality';
        
        const prompt = `Generate 5 realistic, high-quality stock image search queries for a ${details.type} website named "${details.name}" with a ${details.designStyle} design style.

PURPOSE: ${purpose} section image (${purpose === "hero" ? "main hero banner" : purpose === "about" ? "about section" : "services section"})

REQUIREMENTS:
- ${style} aesthetic
- Realistic photography (not illustrations)
- Include: lighting, composition, atmosphere
- Focus on: ${details.type} business

Return ONLY a JSON array of 5 strings. No other text. No explanations.`;

        try {
            const response = await fetch('http://localhost:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: false,
                    temperature: 0.3,
                    max_tokens: 300
                })
            });
            
            const data = await response.json();
            let queries = [];
            try {
                let cleanResponse = data.response.trim();
                cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
                const jsonMatch = cleanResponse.match(/\[[\s\S]*\]/);
                if (jsonMatch) queries = JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.log('Failed to parse Ollama response');
            }
            if (!queries || !Array.isArray(queries) || queries.length < 3) {
                queries = this.getFallbackQueries(details.type, purpose);
            }
            return queries.slice(0, 5);
        } catch (error) {
            console.error('Image query generation failed:', error.message);
            return this.getFallbackQueries(details.type, purpose);
        }
    }

    getFallbackQueries(businessType, purpose = "hero") {
        const baseQueries = {
            'Donut Shop': {
                hero: ['fresh donuts display case bakery', 'donut shop interior warm lighting', 'artisan donuts close up photography'],
                about: ['bakery staff smiling', 'donut making process', 'baker preparing fresh donuts'],
                services: ['donut variety selection', 'pastry counter display', 'coffee and donuts together']
            },
            'Coffee Shop': {
                hero: ['coffee shop interior modern design', 'barista preparing latte art', 'coffee beans close up macro'],
                about: ['coffee roasting process', 'friendly barista serving', 'coffee shop atmosphere'],
                services: ['coffee menu display', 'fresh pastries counter', 'cafe seating area']
            },
            'Restaurant': {
                hero: ['restaurant interior elegant dining', 'chef preparing gourmet dish', 'food presentation close up'],
                about: ['chef plating dish', 'restaurant kitchen action', 'dining experience'],
                services: ['signature dish presentation', 'wine selection', 'private dining area']
            },
            'Gym': {
                hero: ['modern gym interior equipment', 'athlete training weights', 'fitness center clean bright'],
                about: ['personal trainer with client', 'gym members working out', 'fitness community'],
                services: ['group fitness class', 'weight training area', 'cardio equipment']
            },
            'default': {
                hero: ['professional business interior', 'modern office workspace', 'customer service experience'],
                about: ['team collaboration', 'business professionals working', 'company culture'],
                services: ['service delivery', 'client consultation', 'quality assurance']
            }
        };
        const fallback = baseQueries[businessType] || baseQueries.default;
        return fallback[purpose] || fallback.hero;
    }

    async fetchImageFromPexels(query) {
        const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
        if (!PEXELS_API_KEY) return null;
        try {
            const response = await axios.get('https://api.pexels.com/v1/search', {
                headers: { 'Authorization': PEXELS_API_KEY },
                params: { query, per_page: 5, orientation: 'landscape' }
            });
            if (response.data.photos && response.data.photos.length > 0) {
                return response.data.photos[0].src.large2x || response.data.photos[0].src.large;
            }
            return null;
        } catch (error) {
            console.error('Pexels API error:', error.message);
            return null;
        }
    }

    async fetchImageFromUnsplash(query) {
        const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
        if (!UNSPLASH_ACCESS_KEY) return null;
        try {
            const response = await axios.get('https://api.unsplash.com/search/photos', {
                headers: { 'Authorization': `Client-ID ${UNSPLASH_ACCESS_KEY}` },
                params: { query, per_page: 5, orientation: 'landscape' }
            });
            if (response.data.results && response.data.results.length > 0) {
                return response.data.results[0].urls.regular;
            }
            return null;
        } catch (error) {
            console.error('Unsplash API error:', error.message);
            return null;
        }
    }

    async fetchImageWithFallback(query, purpose = "hero") {
        const cacheKey = `${query}-${purpose}`;
        if (this.imageCache.has(cacheKey)) {
            console.log(`✓ Using cached image for: "${query}"`);
            return this.imageCache.get(cacheKey);
        }
        let imageUrl = await this.fetchImageFromPexels(query);
        if (imageUrl) {
            console.log(`✓ Image found on Pexels for: "${query}"`);
            this.imageCache.set(cacheKey, imageUrl);
            return imageUrl;
        }
        imageUrl = await this.fetchImageFromUnsplash(query);
        if (imageUrl) {
            console.log(`✓ Image found on Unsplash for: "${query}"`);
            this.imageCache.set(cacheKey, imageUrl);
            return imageUrl;
        }
        console.log(`✗ No image found for: "${query}"`);
        return null;
    }

    async getDynamicImage(details, purpose = "hero") {
    try {
        const queries = await this.generateImageQueries(details, purpose);
        console.log(`Generated queries for ${purpose}:`, queries);
        
        // Try each query until we find an image
        for (const query of queries) {
            const imageUrl = await this.fetchImageWithFallback(query, purpose);
            if (imageUrl) {
                console.log(`✓ Found ${purpose} image for: "${query}"`);
                return imageUrl;
            }
        }
        
        console.log(`⚠️ No image found, using fallback for ${purpose}`);
        return this.getFallbackImage();
    } catch (error) {
        console.error('Dynamic image fetch failed:', error);
        return this.getFallbackImage();
    }
}

    getFallbackImage() {
        return 'https://images.pexels.com/photos/3184418/pexels-photo-3184418.jpeg?auto=compress&cs=tinysrgb&w=1200';
    }

    // ========== SERVICE IMAGES ==========

    async getServiceImages(details, services) {
        const serviceImagePromises = services.map(async (service) => {
            const image = await this.getDynamicImage({ ...details, type: service }, "services");
            return { service, image };
        });
        return await Promise.all(serviceImagePromises);
    }

    // ========== FILE GENERATION ==========

    async createFiles(details) {
        const outputDir = path.join(__dirname, '../../public/generated');
        await fs.mkdir(outputDir, { recursive: true });

        const timestamp = Date.now();
        const filename = `site-${timestamp}`;
        
        const html = await this.generateModernHTML(details, filename);
        const css = this.generateModernCSS(details);
        const js = this.generateModernJS(details);

        await fs.writeFile(path.join(outputDir, `${filename}.html`), html);
        await fs.writeFile(path.join(outputDir, `${filename}.css`), css);
        await fs.writeFile(path.join(outputDir, `${filename}.js`), js);

        return {
            html: `/generated/${filename}.html`,
            css: `/generated/${filename}.css`,
            js: `/generated/${filename}.js`
        };
    }

 async generateModernHTML(details, filename) {
    // Fetch only hero and about images (skip service images for now)
    const [heroImage, aboutImage] = await Promise.all([
        this.getDynamicImage(details, "hero"),
        this.getDynamicImage(details, "about")
    ]);
    
    const getServiceDescription = (service) => {
        if (details.serviceDescriptions && details.serviceDescriptions[service]) {
            return details.serviceDescriptions[service];
        }
        return `Professional ${service.toLowerCase()} service with attention to detail and customer satisfaction guaranteed.`;
    };
    
    const contact = details.contact || {};
    const phone = contact.phone || '+27 79 123 4567';
    const email = contact.email || `info@${details.name.toLowerCase().replace(/\s/g, '')}.com`;
    const whatsapp = contact.whatsapp || '+27 79 123 4567';
    const website = contact.website || '';
    const whatsappUrl = `https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}?text=Hi! I'm interested in ${encodeURIComponent(details.name)}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${details.name} | ${details.type}</title>
    <link rel="stylesheet" href="${filename}.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://unpkg.com/aos@next/dist/aos.css" />
</head>
<body>
    <nav class="navbar">
        <div class="nav-container">
            <div class="logo"><i class="fas fa-${this.getIconForType(details.type)}"></i> ${details.name}</div>
            <ul class="nav-links">
                <li><a href="#home">Home</a></li>
                <li><a href="#services">Services</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#contact">Contact</a></li>
            </ul>
            <div class="mobile-menu"><i class="fas fa-bars"></i></div>
        </div>
    </nav>

    <section id="home" class="hero" style="background: linear-gradient(135deg, ${details.primaryColor}cc, ${details.secondaryColor}cc), url('${heroImage}'); background-size: cover; background-position: center;">
        <div class="hero-content">
            <div class="hero-text" data-aos="fade-up">
                <h1 class="hero-title">${details.name}</h1>
                <p class="hero-subtitle">${details.tagline}</p>
                <p class="hero-description">📍 ${details.location}</p>
                <div class="hero-buttons">
                    <a href="#services" class="btn-primary">Explore Services</a>
                    <a href="${whatsappUrl}" class="btn-whatsapp" target="_blank"><i class="fab fa-whatsapp"></i> WhatsApp Us</a>
                </div>
            </div>
        </div>
        <div class="hero-wave">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320">
                <path fill="white" fill-opacity="1" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,122.7C672,117,768,139,864,154.7C960,171,1056,181,1152,165.3C1248,149,1344,107,1392,85.3L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
            </svg>
        </div>
    </section>

    <section id="services" class="services">
        <div class="container">
            <div class="section-header" data-aos="fade-up">
                <h2>Our Services</h2>
                <p>What we offer to make your experience exceptional</p>
            </div>
            <div class="services-grid">
                ${details.services.map((service, index) => `
                    <div class="service-card" data-aos="fade-up" data-aos-delay="${index * 100}">
                        <div class="service-icon"><i class="fas fa-${this.getServiceIcon(service)}"></i></div>
                        <h3>${service}</h3>
                        <p>${getServiceDescription(service)}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    </section>

    <section id="about" class="about">
        <div class="container">
            <div class="about-content">
                <div class="about-text" data-aos="fade-right">
                    <h2>About ${details.name}</h2>
                    ${details.customAbout ? `<p>${details.customAbout}</p>` : `<p>Welcome to ${details.name}, your premier ${details.type.toLowerCase()} in ${details.location}. We pride ourselves on delivering exceptional service and creating memorable experiences for our valued customers.</p><p>Our team of dedicated professionals is committed to excellence, ensuring that every visit exceeds your expectations. With years of experience and a passion for what we do, we've become a trusted name in the community.</p>`}
                    <div class="about-stats">
                        <div class="stat"><div class="stat-number" data-count="1000">0</div><div class="stat-label">Happy Customers</div></div>
                        <div class="stat"><div class="stat-number" data-count="50">0</div><div class="stat-label">5-Star Reviews</div></div>
                        <div class="stat"><div class="stat-number" data-count="5">0</div><div class="stat-label">Years Experience</div></div>
                    </div>
                </div>
                <div class="about-image" data-aos="fade-left">
                    <img src="${aboutImage}" alt="${details.name} - About Us">
                </div>
            </div>
        </div>
    </section>

    <section id="contact" class="contact">
        <div class="container">
            <div class="section-header" data-aos="fade-up">
                <h2>Get In Touch</h2>
                <p>We'd love to hear from you</p>
            </div>
            <div class="contact-wrapper">
                <div class="contact-info" data-aos="fade-right">
                    <div class="info-item"><i class="fas fa-map-marker-alt"></i><div><h4>Location</h4><p>📍 ${details.location}</p></div></div>
                    <div class="info-item"><i class="fas fa-phone"></i><div><h4>Phone</h4><p><a href="tel:${phone}" style="color: inherit;">${phone}</a></p></div></div>
                    <div class="info-item"><i class="fas fa-envelope"></i><div><h4>Email</h4><p><a href="mailto:${email}" style="color: inherit;">${email}</a></p></div></div>
                    <div class="info-item"><i class="fab fa-whatsapp"></i><div><h4>WhatsApp</h4><p><a href="${whatsappUrl}" target="_blank" style="color: inherit;">${whatsapp}</a></p></div></div>
                    ${website ? `<div class="info-item"><i class="fas fa-globe"></i><div><h4>Website</h4><p><a href="${website}" target="_blank" style="color: ${details.primaryColor};">${website.replace(/^https?:\/\//, '')}</a></p></div></div>` : ''}
                </div>
                <form class="contact-form" id="contactForm" data-aos="fade-left">
                    <input type="text" placeholder="Your Name" required>
                    <input type="email" placeholder="Your Email" required>
                    <textarea rows="5" placeholder="Your Message" required></textarea>
                    <button type="submit" class="btn-primary">Send Message <i class="fas fa-paper-plane"></i></button>
                </form>
            </div>
        </div>
    </section>

    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div class="footer-section" data-aos="fade-up"><h3>${details.name}</h3><p>Your trusted ${details.type.toLowerCase()} in ${details.location}</p></div>
                <div class="footer-section" data-aos="fade-up" data-aos-delay="100"><h3>Quick Links</h3><ul><li><a href="#home">Home</a></li><li><a href="#services">Services</a></li><li><a href="#about">About</a></li><li><a href="#contact">Contact</a></li></ul></div>
                <div class="footer-section" data-aos="fade-up" data-aos-delay="200"><h3>Follow Us</h3><div class="social-links"><a href="#"><i class="fab fa-facebook"></i></a><a href="#"><i class="fab fa-instagram"></i></a><a href="#"><i class="fab fa-twitter"></i></a><a href="${whatsappUrl}"><i class="fab fa-whatsapp"></i></a></div></div>
            </div>
            <div class="footer-bottom"><p>&copy; 2024 ${details.name}. All rights reserved. | Designed with <i class="fas fa-heart"></i> for ${details.location}</p></div>
        </div>
    </footer>

    <script src="https://unpkg.com/aos@next/dist/aos.js"></script>
    <script src="${filename}.js"></script>
</body>
</html>`;
}

    generateModernCSS(details) {
        return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}
body {
    font-family: 'Inter', sans-serif;
    line-height: 1.6;
    color: #1f2937;
}
.navbar {
    position: fixed;
    top: 0;
    width: 100%;
    background: white;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 1000;
    padding: 1rem 0;
}
.nav-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.logo {
    font-size: 1.5rem;
    font-weight: 700;
    color: ${details.primaryColor};
    display: flex;
    align-items: center;
    gap: 0.5rem;
}
.nav-links {
    display: flex;
    list-style: none;
    gap: 2rem;
}
.nav-links a {
    text-decoration: none;
    color: #1f2937;
    font-weight: 500;
    transition: color 0.3s;
}
.nav-links a:hover {
    color: ${details.primaryColor};
}
.mobile-menu {
    display: none;
    font-size: 1.5rem;
    cursor: pointer;
}
.hero {
    min-height: 100vh;
    background-size: cover;
    background-position: center;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 8rem 2rem;
}
.hero-title {
    font-size: 4rem;
    font-weight: 800;
    margin-bottom: 1rem;
    color: white;
}
.hero-subtitle {
    font-size: 1.5rem;
    color: rgba(255,255,255,0.95);
    margin-bottom: 1rem;
}
.hero-description {
    font-size: 1.2rem;
    color: rgba(255,255,255,0.9);
    margin-bottom: 2rem;
}
.hero-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
}
.btn-primary {
    display: inline-block;
    padding: 1rem 2rem;
    background: white;
    color: ${details.primaryColor};
    text-decoration: none;
    border-radius: 50px;
    font-weight: 600;
    transition: all 0.3s;
}
.btn-primary:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 20px rgba(0,0,0,0.2);
}
.btn-whatsapp {
    display: inline-block;
    padding: 1rem 2rem;
    background: #25D366;
    color: white;
    text-decoration: none;
    border-radius: 50px;
    font-weight: 600;
    transition: all 0.3s;
}
.services, .about, .contact {
    padding: 6rem 2rem;
}
.container {
    max-width: 1200px;
    margin: 0 auto;
}
.section-header {
    text-align: center;
    margin-bottom: 4rem;
}
.section-header h2 {
    font-size: 2.5rem;
    margin-bottom: 1rem;
}
.services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}
.service-card {
    border-radius: 1rem;
    overflow: hidden;
    transition: transform 0.3s;
}
.service-card:hover {
    transform: translateY(-5px);
}
.service-overlay {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
}
.service-icon {
    width: 70px;
    height: 70px;
    background: rgba(255,255,255,0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1.5rem;
}
.service-icon i {
    font-size: 1.8rem;
    color: white;
}
.about-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    align-items: center;
}
.about-stats {
    display: flex;
    gap: 2rem;
    margin-top: 2rem;
}
.stat-number {
    font-size: 2rem;
    font-weight: 700;
    color: ${details.primaryColor};
}
.about-image img {
    width: 100%;
    border-radius: 1rem;
}
.contact-wrapper {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
}
.contact-info {
    display: flex;
    flex-direction: column;
    gap: 2rem;
}
.info-item {
    display: flex;
    align-items: center;
    gap: 1rem;
}
.info-item i {
    width: 50px;
    height: 50px;
    background: ${details.primaryColor}10;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    color: ${details.primaryColor};
}
.contact-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
.contact-form input,
.contact-form textarea {
    padding: 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 0.5rem;
}
.contact-form input:focus,
.contact-form textarea:focus {
    outline: none;
    border-color: ${details.primaryColor};
}
.footer {
    background: #1f2937;
    color: white;
    padding: 4rem 2rem 2rem;
}
.footer-content {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    margin-bottom: 2rem;
}
.social-links {
    display: flex;
    gap: 1rem;
}
.social-links a {
    color: white;
    font-size: 1.5rem;
    transition: color 0.3s;
}
.social-links a:hover {
    color: ${details.primaryColor};
}
.footer-bottom {
    text-align: center;
    padding-top: 2rem;
    border-top: 1px solid #374151;
}
@media (max-width: 768px) {
    .nav-links {
        display: none;
    }
    .mobile-menu {
        display: block;
    }
    .hero-title {
        font-size: 2.5rem;
    }
    .about-content,
    .contact-wrapper {
        grid-template-columns: 1fr;
    }
}`;
    }

    generateModernJS(details) {
        return `AOS.init({ duration: 1000, once: true });
document.querySelector('.mobile-menu')?.addEventListener('click', () => {
    document.querySelector('.nav-links')?.classList.toggle('active');
});
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
    });
});
document.getElementById('contactForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Thank you! We will get back to you soon.');
    e.target.reset();
});
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 100) navbar.style.background = 'rgba(255,255,255,0.98)';
    else navbar.style.background = 'white';
});
const stats = document.querySelectorAll('.stat-number');
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const stat = entry.target;
            const target = parseInt(stat.getAttribute('data-count'));
            let current = 0;
            const timer = setInterval(() => {
                current += target / 50;
                if (current >= target) {
                    stat.textContent = target;
                    clearInterval(timer);
                } else {
                    stat.textContent = Math.floor(current);
                }
            }, 20);
            observer.unobserve(stat);
        }
    });
}, { threshold: 0.5 });
stats.forEach(stat => observer.observe(stat));`;
    }
}

module.exports = WebsiteGenerator;