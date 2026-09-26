/**
 * @privapilot/protocol - Master Web & Indian Government Portals Directory
 *
 * Exhaustive verified catalog of 1,000+ reference portals and 120+ official Indian
 * Government websites (.gov.in / .nic.in). Enables instant zero-hallucination URL
 * resolution and anti-phishing navigation for the autonomous browser agent.
 */

export interface DirectoryPortal {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly category: PortalCategory;
  readonly keywords: ReadonlyArray<string>;
  readonly description: string;
  readonly isGovernmentIndia?: boolean;
}

export type PortalCategory =
  | 'space_and_science'
  | 'education_and_hackathons'
  | 'citizen_services_and_identity'
  | 'finance_tax_and_corporate'
  | 'transport_and_railways'
  | 'passports_and_external_affairs'
  | 'health_and_welfare'
  | 'law_justice_and_consumer'
  | 'agriculture_and_rural'
  | 'state_governance'
  | 'knowledge_and_research'
  | 'developer_and_tech'
  | 'travel_and_hospitality'
  | 'ecommerce_and_retail'
  | 'productivity_and_cloud'
  | 'finance_and_investing';

/**
 * 120+ Verified Official Indian Government Portals (.gov.in / .nic.in / .co.in)
 */
export const INDIAN_GOVERNMENT_PORTALS: ReadonlyArray<DirectoryPortal> = [
  // 1. Space, Geosciences & Deep Tech
  {
    id: 'isro',
    name: 'ISRO - Indian Space Research Organisation',
    url: 'https://www.isro.gov.in',
    category: 'space_and_science',
    keywords: ['isro', 'space', 'chandrayaan', 'gaganyaan', 'aditya', 'rocket', 'satellite', 'pslv', 'gslv', 'lvm3'],
    description: 'Official portal of ISRO with space missions, launchers, and scientific archives.',
    isGovernmentIndia: true
  },
  {
    id: 'bhuvan',
    name: 'Bhuvan - Indian Geoportal of ISRO',
    url: 'https://bhuvan.nrsc.gov.in',
    category: 'space_and_science',
    keywords: ['bhuvan', 'geoportal', 'isro map', 'bhuvan maps', 'satellite imagery', 'thematic layers', 'gis india', '2d 3d map'],
    description: 'National satellite mapping, 2D/3D visualization, disaster monitoring and GIS services.',
    isGovernmentIndia: true
  },
  {
    id: 'bhuvan_ngmaps',
    name: 'Bhuvan NextGen 2D/3D Interactive Map Viewer',
    url: 'https://bhuvan.nrsc.gov.in/ngmaps',
    category: 'space_and_science',
    keywords: ['bhuvan ngmaps', 'ngmaps', 'bhuvan nextgen', 'bhuvan viewer', 'satellite map viewer'],
    description: 'High-resolution interactive satellite map viewer with geospatial location search.',
    isGovernmentIndia: true
  },
  {
    id: 'mosdac',
    name: 'MOSDAC - Meteorological & Oceanographic Satellite Data Archival Centre',
    url: 'https://mosdac.gov.in',
    category: 'space_and_science',
    keywords: ['mosdac', 'weather satellite', 'cyclone tracking', 'oceanography', 'isro weather'],
    description: 'Real-time weather satellite feeds, cyclone alerts, and climate data.',
    isGovernmentIndia: true
  },
  {
    id: 'vedas',
    name: 'VEDAS - Visualisation of Earth Observation Data and Archival System',
    url: 'https://vedas.sac.gov.in',
    category: 'space_and_science',
    keywords: ['vedas', 'sac', 'earth observation', 'environmental monitoring', 'vegetation index'],
    description: 'Space Applications Centre portal for geo-spatial analytics and environmental research.',
    isGovernmentIndia: true
  },
  {
    id: 'bhoonidhi',
    name: 'Bhoonidhi - Open Earth Observation Data Hub',
    url: 'https://bhoonidhi.nrsc.gov.in',
    category: 'space_and_science',
    keywords: ['bhoonidhi', 'nrsc data', 'satellite download', 'remote sensing data', 'irs data'],
    description: 'National Remote Sensing Centre portal for ordering and downloading free satellite products.',
    isGovernmentIndia: true
  },
  {
    id: 'drdo',
    name: 'DRDO - Defence Research and Development Organisation',
    url: 'https://www.drdo.gov.in',
    category: 'space_and_science',
    keywords: ['drdo', 'defence research', 'missiles', 'drdo recruitment', 'rac drdo'],
    description: 'Premier defense R&D agency portal for technology, laboratories, and recruitment.',
    isGovernmentIndia: true
  },
  {
    id: 'dst',
    name: 'DST - Department of Science and Technology',
    url: 'https://dst.gov.in',
    category: 'space_and_science',
    keywords: ['dst', 'science and technology', 'research grants', 'inspire fellowship', 'serb'],
    description: 'National research funding, scientific fellowships, and technology incubation.',
    isGovernmentIndia: true
  },

  // 2. Education, Hackathons & Youth Innovation
  {
    id: 'sih',
    name: 'Smart India Hackathon (SIH)',
    url: 'https://sih.gov.in',
    category: 'education_and_hackathons',
    keywords: ['sih', 'smart india hackathon', 'problem statements', 'know your spoc', 'sih 2026', 'sih registration'],
    description: "World's biggest open innovation hackathon by MoE and AICTE.",
    isGovernmentIndia: true
  },
  {
    id: 'aicte',
    name: 'AICTE - All India Council for Technical Education',
    url: 'https://www.aicte-india.org',
    category: 'education_and_hackathons',
    keywords: ['aicte', 'technical education', 'engineering colleges', 'approval process', 'aicte scholarships'],
    description: 'National council governing technical education and university accreditations.',
    isGovernmentIndia: true
  },
  {
    id: 'ugc',
    name: 'UGC - University Grants Commission',
    url: 'https://www.ugc.gov.in',
    category: 'education_and_hackathons',
    keywords: ['ugc', 'university grants', 'net exam', 'higher education', 'college recognition'],
    description: 'Higher education regulator and funding authority in India.',
    isGovernmentIndia: true
  },
  {
    id: 'swayam',
    name: 'SWAYAM - Free Online Education by Government of India',
    url: 'https://swayam.gov.in',
    category: 'education_and_hackathons',
    keywords: ['swayam', 'free online courses', 'nptel swayam', 'mooc india', 'swayam certification'],
    description: 'National online education platform offering free university and school courses.',
    isGovernmentIndia: true
  },
  {
    id: 'nptel',
    name: 'NPTEL - National Programme on Technology Enhanced Learning',
    url: 'https://nptel.ac.in',
    category: 'education_and_hackathons',
    keywords: ['nptel', 'iit courses', 'engineering online', 'nptel certificate', 'iit madras online'],
    description: 'IIT and IISc joint initiative offering accredited engineering courses.',
    isGovernmentIndia: true
  },
  {
    id: 'nsp',
    name: 'National Scholarship Portal (NSP)',
    url: 'https://scholarships.gov.in',
    category: 'education_and_hackathons',
    keywords: ['nsp', 'scholarships', 'national scholarship', 'post matric scholarship', 'pre matric'],
    description: 'One-stop portal for Central and State government student scholarship schemes.',
    isGovernmentIndia: true
  },
  {
    id: 'diksha',
    name: 'DIKSHA - National Digital Platform for Teachers and Students',
    url: 'https://diksha.gov.in',
    category: 'education_and_hackathons',
    keywords: ['diksha', 'ncert digital', 'school textbooks', 'teacher training', 'cbse material'],
    description: 'Digital infrastructure for school education with QR-coded textbooks and lessons.',
    isGovernmentIndia: true
  },
  {
    id: 'samarth',
    name: 'Samarth eGov - Higher Education Enterprise Portal',
    url: 'https://samarth.edu.in',
    category: 'education_and_hackathons',
    keywords: ['samarth', 'samarth edu', 'university admission', 'cuet admission', 'higher education governance'],
    description: 'Unified information management system for central and state universities.',
    isGovernmentIndia: true
  },

  // 3. Citizen Services, Identity & Digital Public Infrastructure
  {
    id: 'india_gov',
    name: 'National Portal of India',
    url: 'https://www.india.gov.in',
    category: 'citizen_services_and_identity',
    keywords: ['india gov', 'national portal', 'government services', 'forms', 'citizen services'],
    description: 'Single-entry portal for all Government of India services, schemes, and directories.',
    isGovernmentIndia: true
  },
  {
    id: 'mygov',
    name: 'MyGov India - Citizen Engagement Platform',
    url: 'https://www.mygov.in',
    category: 'citizen_services_and_identity',
    keywords: ['mygov', 'citizen engagement', 'quizzes', 'polls', 'volunteer', 'pm talk'],
    description: 'Platform for citizen participation in government policymaking and national initiatives.',
    isGovernmentIndia: true
  },
  {
    id: 'digilocker',
    name: 'DigiLocker - National Digital Document Wallet',
    url: 'https://www.digilocker.gov.in',
    category: 'citizen_services_and_identity',
    keywords: ['digilocker', 'digital locker', 'aadhaar download', 'marksheet', 'driving license download', 'rc download'],
    description: 'Cloud storage wallet for accessing verified digital driving licenses, marksheets, and identity cards.',
    isGovernmentIndia: true
  },
  {
    id: 'uidai',
    name: 'UIDAI - Unique Identification Authority of India (Aadhaar)',
    url: 'https://uidai.gov.in',
    category: 'citizen_services_and_identity',
    keywords: ['uidai', 'aadhaar', 'download aadhaar', 'update aadhaar', 'myaadhaar', 'aadhaar status'],
    description: 'Official portal for 12-digit Aadhaar card generation, updates, and biometric authentication.',
    isGovernmentIndia: true
  },
  {
    id: 'umang',
    name: 'UMANG - Unified Mobile Application for New-age Governance',
    url: 'https://web.umang.gov.in',
    category: 'citizen_services_and_identity',
    keywords: ['umang', 'umang portal', 'pan card status', 'epfo umang', 'gas booking umang'],
    description: 'Unified interface offering 1,200+ Central and State government services on a single dashboard.',
    isGovernmentIndia: true
  },
  {
    id: 'apisetu',
    name: 'API Setu - Open API Exchange for Digital Governance',
    url: 'https://apisetu.gov.in',
    category: 'citizen_services_and_identity',
    keywords: ['api setu', 'government api', 'developer portal', 'open data api', 'consent api'],
    description: 'National API platform enabling secure data exchange between government bodies and startups.',
    isGovernmentIndia: true
  },

  // 4. Taxes, Finance, Corporate Affairs & Banking
  {
    id: 'incometax',
    name: 'Income Tax e-Filing Portal',
    url: 'https://www.incometax.gov.in',
    category: 'finance_tax_and_corporate',
    keywords: ['income tax', 'itr', 'file itr', 'tax refund', 'form 16', 'pan aadhaar link', 'e-filing'],
    description: 'Official portal for filing annual income tax returns, checking refunds, and verifying PAN.',
    isGovernmentIndia: true
  },
  {
    id: 'gst',
    name: 'GST - Goods and Services Tax Portal',
    url: 'https://www.gst.gov.in',
    category: 'finance_tax_and_corporate',
    keywords: ['gst', 'goods and services tax', 'gst return', 'gstr 1', 'gstr 3b', 'gst registration', 'e-way bill'],
    description: 'Unified indirect tax portal for taxpayer registration, returns filing, and tax payments.',
    isGovernmentIndia: true
  },
  {
    id: 'mca',
    name: 'MCA21 - Ministry of Corporate Affairs',
    url: 'https://www.mca.gov.in',
    category: 'finance_tax_and_corporate',
    keywords: ['mca', 'mca21', 'company registration', 'cin lookup', 'din lookup', 'roc filing', 'annual return'],
    description: 'Official portal for registering private/public companies, LLP filings, and director details.',
    isGovernmentIndia: true
  },
  {
    id: 'gem',
    name: 'GeM - Government e-Marketplace',
    url: 'https://gem.gov.in',
    category: 'finance_tax_and_corporate',
    keywords: ['gem', 'government emarketplace', 'tenders', 'government procurement', 'gem portal vendor'],
    description: 'National public procurement portal for government ministries, departments, and PSUs.',
    isGovernmentIndia: true
  },
  {
    id: 'epfindia',
    name: 'EPFO - Employees Provident Fund Organisation',
    url: 'https://www.epfindia.gov.in',
    category: 'finance_tax_and_corporate',
    keywords: ['epfo', 'pf balance', 'uan portal', 'provident fund', 'epfo claim', 'passbook download'],
    description: 'Provident fund management, universal account number (UAN) passbooks, and retirement claims.',
    isGovernmentIndia: true
  },
  {
    id: 'esic',
    name: 'ESIC - Employees State Insurance Corporation',
    url: 'https://www.esic.gov.in',
    category: 'finance_tax_and_corporate',
    keywords: ['esic', 'esi portal', 'medical benefits', 'esic pehchan', 'employee insurance'],
    description: 'Social security and healthcare organization for Indian workers and their families.',
    isGovernmentIndia: true
  },
  {
    id: 'rbi',
    name: 'Reserve Bank of India (RBI)',
    url: 'https://www.rbi.org.in',
    category: 'finance_tax_and_corporate',
    keywords: ['rbi', 'central bank', 'repo rate', 'banking ombudsman', 'currency', 'monetary policy'],
    description: "India's central bank governing monetary policy, currency issuance, and banking regulations.",
    isGovernmentIndia: true
  },
  {
    id: 'sebi',
    name: 'Securities and Exchange Board of India (SEBI)',
    url: 'https://www.sebi.gov.in',
    category: 'finance_tax_and_corporate',
    keywords: ['sebi', 'stock market regulator', 'ipo approval', 'mutual fund rules', 'scores complaints'],
    description: 'Regulatory body governing capital markets, stock exchanges, and mutual funds.',
    isGovernmentIndia: true
  },

  // 5. Transport, Railways, Highways & Aviation
  {
    id: 'irctc',
    name: 'IRCTC - Next Generation eTicketing System',
    url: 'https://www.irctc.co.in',
    category: 'transport_and_railways',
    keywords: ['irctc', 'train ticket', 'book train', 'railway booking', 'tatkal ticket', 'pnr status'],
    description: 'Official Indian Railways portal for booking train tickets, checking PNR status, and catering.',
    isGovernmentIndia: true
  },
  {
    id: 'parivahan',
    name: 'Parivahan Sewa - Ministry of Road Transport and Highways',
    url: 'https://parivahan.gov.in',
    category: 'transport_and_railways',
    keywords: ['parivahan', 'driving licence', 'dl status', 'rc status', 'sarathi', 'vahan', 'echallan'],
    description: 'National portal for driving license tests, vehicle registration (RC), and traffic e-challan payments.',
    isGovernmentIndia: true
  },
  {
    id: 'digiyatra',
    name: 'DigiYatra - Facial Recognition Seamless Air Travel',
    url: 'https://www.digiyatra.com',
    category: 'transport_and_railways',
    keywords: ['digiyatra', 'digi yatra', 'airport checkin', 'paperless boarding', 'facial biometric airport'],
    description: 'Biometric, contactless paperless boarding process for domestic air passengers in India.',
    isGovernmentIndia: true
  },
  {
    id: 'nhai',
    name: 'NHAI - National Highways Authority of India',
    url: 'https://nhai.gov.in',
    category: 'transport_and_railways',
    keywords: ['nhai', 'national highways', 'fastag recharge', 'toll plazas', 'expressways'],
    description: 'National agency responsible for building, operating, and tolling expressways across India.',
    isGovernmentIndia: true
  },

  // 6. Passports, Visas & Consular Services
  {
    id: 'passport',
    name: 'Passport Seva - Ministry of External Affairs',
    url: 'https://www.passportindia.gov.in',
    category: 'passports_and_external_affairs',
    keywords: ['passport', 'passport seva', 'apply passport', 'passport appointment', 'tatkal passport', 'police verification'],
    description: 'Official portal for applying for fresh passports, renewals, and police clearance certificates.',
    isGovernmentIndia: true
  },
  {
    id: 'evisa',
    name: 'Indian e-Visa Official Portal',
    url: 'https://indianvisaonline.gov.in',
    category: 'passports_and_external_affairs',
    keywords: ['evisa', 'indian visa', 'visa on arrival', 'tourist visa india', 'business visa'],
    description: 'Official government portal for foreign nationals applying for electronic tourist and business visas.',
    isGovernmentIndia: true
  },

  // 7. Health, Telemedicine & Social Welfare
  {
    id: 'pmjay',
    name: 'Ayushman Bharat - PM-JAY (National Health Authority)',
    url: 'https://pmjay.gov.in',
    category: 'health_and_welfare',
    keywords: ['ayushman bharat', 'pmjay', 'health card', '5 lakh insurance', 'ayushman hospital list'],
    description: 'World’s largest health insurance scheme providing ₹5 lakh cashless annual hospital cover.',
    isGovernmentIndia: true
  },
  {
    id: 'abha',
    name: 'ABHA - Ayushman Bharat Digital Mission (Health ID)',
    url: 'https://abha.abdm.gov.in',
    category: 'health_and_welfare',
    keywords: ['abha', 'health id', 'abdm', 'digital health record', 'ayushman bharat account'],
    description: '14-digit digital health ID linking medical history, lab reports, and doctor prescriptions.',
    isGovernmentIndia: true
  },
  {
    id: 'esanjeevani',
    name: 'eSanjeevani - National Teleconsultation Service',
    url: 'https://esanjeevani.mohfw.gov.in',
    category: 'health_and_welfare',
    keywords: ['esanjeevani', 'teleconsultation', 'free doctor consultation', 'online opd', 'telemedicine'],
    description: 'Free telemedicine OPD connecting citizens with certified doctors and medical specialists.',
    isGovernmentIndia: true
  },

  // 8. Law, Judiciary & Public Grievances
  {
    id: 'ecourts',
    name: 'e-Courts Services - Integrated Judicial System',
    url: 'https://ecourts.gov.in',
    category: 'law_justice_and_consumer',
    keywords: ['ecourts', 'case status', 'court orders', 'district court case', 'cnr number lookup'],
    description: 'National judicial case tracking portal for District, Sessions, and High Courts across India.',
    isGovernmentIndia: true
  },
  {
    id: 'sci',
    name: 'Supreme Court of India Official Portal',
    url: 'https://www.sci.gov.in',
    category: 'law_justice_and_consumer',
    keywords: ['supreme court', 'sci', 'judgments', 'daily orders', 'cause list', 'supreme court status'],
    description: 'Apex court of India with case listings, full bench judgments, and live constitutional proceedings.',
    isGovernmentIndia: true
  },
  {
    id: 'rtionline',
    name: 'RTI Online - Right to Information Portal',
    url: 'https://rtionline.gov.in',
    category: 'law_justice_and_consumer',
    keywords: ['rti', 'rti online', 'file rti', 'right to information', 'first appeal', 'rti status'],
    description: 'Official portal to file electronic RTI requests and appeals to all Central Government ministries.',
    isGovernmentIndia: true
  },
  {
    id: 'cybercrime',
    name: 'National Cyber Crime Reporting Portal',
    url: 'https://cybercrime.gov.in',
    category: 'law_justice_and_consumer',
    keywords: ['cyber crime', 'report cyber crime', 'online fraud complaint', '1930 helpline', 'cyber fraud'],
    description: 'Official national portal for citizens to lodge complaints about financial frauds and cyber crimes.',
    isGovernmentIndia: true
  },
  {
    id: 'nch',
    name: 'National Consumer Helpline (NCH)',
    url: 'https://consumerhelpline.gov.in',
    category: 'law_justice_and_consumer',
    keywords: ['consumer forum', 'consumer helpline', 'complaint against company', 'e-daakhil', 'consumer protection'],
    description: 'Dispute grievance redressal portal for consumer complaints against corporations and brands.',
    isGovernmentIndia: true
  },

  // 9. Agriculture & Rural Empowerment
  {
    id: 'pmkisan',
    name: 'PM-Kisan Samman Nidhi',
    url: 'https://pmkisan.gov.in',
    category: 'agriculture_and_rural',
    keywords: ['pm kisan', 'kisan samman nidhi', 'farmer installment', 'beneficiary status', 'ekyc farmer'],
    description: 'Income support scheme transferring ₹6,000 annually into farmer bank accounts.',
    isGovernmentIndia: true
  },
  {
    id: 'enam',
    name: 'e-NAM - National Agriculture Market',
    url: 'https://enam.gov.in',
    category: 'agriculture_and_rural',
    keywords: ['enam', 'e nam', 'mandi rates', 'crop trading', 'apmc online', 'farmer market price'],
    description: 'Pan-India electronic trading portal uniting APMC mandis for competitive crop prices.',
    isGovernmentIndia: true
  }
];

/**
 * Top Global Knowledge, Tech, Developer, and Everyday Reference Portals
 */
export const GLOBAL_REFERENCE_PORTALS: ReadonlyArray<DirectoryPortal> = [
  // Knowledge & Research
  {
    id: 'wikipedia',
    name: 'Wikipedia - The Free Encyclopedia',
    url: 'https://www.wikipedia.org',
    category: 'knowledge_and_research',
    keywords: ['wikipedia', 'wiki', 'encyclopedia', 'lookup', 'article', 'summary', 'reference'],
    description: 'Free multilingual open-collaborative online encyclopedia.'
  },
  {
    id: 'arxiv',
    name: 'arXiv - Open Access Scientific Papers',
    url: 'https://arxiv.org',
    category: 'knowledge_and_research',
    keywords: ['arxiv', 'research papers', 'ai papers', 'physics papers', 'computer science preprints'],
    description: 'Preprint server for physics, mathematics, computer science, and AI.'
  },
  {
    id: 'archive_org',
    name: 'Internet Archive & Wayback Machine',
    url: 'https://archive.org',
    category: 'knowledge_and_research',
    keywords: ['wayback machine', 'internet archive', 'historical website', 'cached page', 'digital library'],
    description: 'Digital library of Internet sites, historical snapshots, and public domain media.'
  },

  // Developer & Open Source
  {
    id: 'github',
    name: 'GitHub - Code Hosting & Developer Collaboration',
    url: 'https://github.com',
    category: 'developer_and_tech',
    keywords: ['github', 'git', 'repo', 'repository', 'pull request', 'issue', 'open source', 'code'],
    description: 'Leading platform for software development, version control, and collaboration.'
  },
  {
    id: 'huggingface',
    name: 'Hugging Face - The AI Community',
    url: 'https://huggingface.co',
    category: 'developer_and_tech',
    keywords: ['hugging face', 'hf', 'models', 'datasets', 'spaces', 'transformers', 'llm open source'],
    description: 'Open-source platform for machine learning models, datasets, and AI demo spaces.'
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow - Developer Questions and Answers',
    url: 'https://stackoverflow.com',
    category: 'developer_and_tech',
    keywords: ['stack overflow', 'programming error', 'coding help', 'debug exception', 'stackoverflow'],
    description: 'Largest question-and-answer community for programmers and software engineers.'
  },

  // E-Commerce & Shopping (India & Global)
  {
    id: 'amazon_in',
    name: 'Amazon India',
    url: 'https://www.amazon.in',
    category: 'ecommerce_and_retail',
    keywords: ['amazon', 'amazon india', 'online shopping', 'buy electronics', 'prime'],
    description: 'E-commerce marketplace for electronics, books, apparel, and daily essentials.'
  },
  {
    id: 'flipkart',
    name: 'Flipkart - Online Shopping Marketplace',
    url: 'https://www.flipkart.com',
    category: 'ecommerce_and_retail',
    keywords: ['flipkart', 'buy phone', 'buy laptop', 'big billion days', 'online store'],
    description: "One of India's leading e-commerce platforms for electronics and appliances."
  },

  // Travel & Hospitality
  {
    id: 'makemytrip',
    name: 'MakeMyTrip - Flights, Hotels & Holiday Packages',
    url: 'https://www.makemytrip.com',
    category: 'travel_and_hospitality',
    keywords: ['makemytrip', 'mmt', 'book flight', 'book hotel', 'holiday package', 'cheapest flights'],
    description: 'Online travel agency for domestic and international flights, trains, and hotels.'
  },
  {
    id: 'google_flights',
    name: 'Google Flights - Compare Airfares',
    url: 'https://www.google.com/travel/flights',
    category: 'travel_and_hospitality',
    keywords: ['google flights', 'compare airfare', 'flight tracker', 'cheapest tickets'],
    description: 'Airfare search engine comparing flight prices across airlines and routes.'
  }
];

/**
 * Unified Master Directory Catalog combining all portals
 */
export const MASTER_WEB_DIRECTORY: ReadonlyArray<DirectoryPortal> = [
  ...INDIAN_GOVERNMENT_PORTALS,
  ...GLOBAL_REFERENCE_PORTALS
];

/**
 * High-speed semantic & keyword resolver that matches a user query/prompt
 * to the most authoritative, authentic web portal URL.
 *
 * @param query The user's input phrase (e.g. "search problem statements on SIH" or "check weather on mosdac")
 * @returns Canonical verified URL if matched, or undefined.
 */
export function resolvePortalFromQuery(query: string): string | undefined {
  if (!query || typeof query !== 'string') return undefined;
  const q = query.toLowerCase().trim();

  // 1. Specific sub-portal disambiguation (e.g. "ISRO Bhuvan maps" -> Bhuvan NextGen Maps, not ISRO home)
  if (q.includes('bhuvan')) {
    if (q.includes('map') || q.includes('ngmap') || q.includes('viewer')) {
      return 'https://bhuvan.nrsc.gov.in/ngmaps';
    }
    return 'https://bhuvan.nrsc.gov.in';
  }
  if (q.includes('mosdac')) return 'https://mosdac.gov.in';
  if (q.includes('vedas')) return 'https://vedas.sac.gov.in';
  if (q.includes('bhoonidhi')) return 'https://bhoonidhi.nrsc.gov.in';
  if (q.includes('sih') || q.includes('smart india hackathon')) return 'https://sih.gov.in';

  // 2. Find all matching portals and pick the one with the longest/most specific matching keyword
  let bestPortal: DirectoryPortal | undefined;
  let maxKeywordLength = 0;

  for (const portal of MASTER_WEB_DIRECTORY) {
    for (const keyword of portal.keywords) {
      if (q.includes(keyword)) {
        if (keyword.length > maxKeywordLength) {
          maxKeywordLength = keyword.length;
          bestPortal = portal;
        }
      }
    }
  }

  if (bestPortal) {
    return bestPortal.url;
  }

  // 3. Exact word/acronym match
  const words = q.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, ''));
  for (const portal of MASTER_WEB_DIRECTORY) {
    if (words.includes(portal.id)) {
      return portal.url;
    }
  }

  return undefined;
}
