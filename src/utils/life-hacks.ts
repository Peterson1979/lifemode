export interface CompanionResource {
  slug: string;
  title: string;
}

export interface LifeHackVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration?: string;
  category?: string;
  videoUrl: string;
  creator?: string;
  hidden?: boolean;
  relatedGuide?: CompanionResource;
  relatedTool?: CompanionResource;
}

/**
 * Dedicated curated video library.
 * Preserves all source entries and assets; duplicates are marked `hidden: true`
 * to hide them from public catalog listings while retaining source records.
 */
export const LIFE_HACK_VIDEOS: LifeHackVideo[] = [
  {
    id: 'pan-heating-technique',
    title: 'How to Properly Heat a Pan',
    description: 'Learn the exact temperature test that prevents sticking when cooking with stainless steel cookware.',
    thumbnail: 'https://i.ytimg.com/vi/CB-SCA1reqE/hqdefault.jpg',
    duration: '2:15',
    category: 'Cookware Care',
    videoUrl: 'https://www.youtube.com/watch?v=CB-SCA1reqE',
    creator: 'Rouxbe',
    relatedTool: {
      slug: 'cookware-material-finder',
      title: 'Cookware Material Finder',
    },
  },
  {
    id: 'basic-knife-skills',
    title: 'Basic Knife Skills',
    description: 'Master the fundamental chef grip, claw hand technique, and slicing motions for safe, efficient prep.',
    thumbnail: 'https://i.ytimg.com/vi/G-Fg7l7G1zw/hqdefault.jpg',
    duration: '3:45',
    category: 'Kitchen Skill',
    videoUrl: 'https://www.youtube.com/watch?v=G-Fg7l7G1zw',
    creator: 'Tasty',
    relatedGuide: {
      slug: 'how-to-clean-and-maintain-kitchen-knives',
      title: 'Kitchen Knife Care & Maintenance Guide',
    },
  },
  {
    id: 'clean-season-cast-iron',
    title: 'How to Clean and Season a Cast-Iron Pan',
    description: 'The proven America’s Test Kitchen routine for washing, drying on stovetop heat, and seasoning cast iron pans.',
    thumbnail: 'https://i.ytimg.com/vi/kmVmKmR0CXA/hqdefault.jpg',
    duration: '4:20',
    category: 'Cookware Care',
    videoUrl: 'https://www.youtube.com/watch?v=kmVmKmR0CXA',
    creator: "America's Test Kitchen",
    relatedGuide: {
      slug: 'how-to-clean-and-season-a-cast-iron-skillet',
      title: 'Cast-Iron Skillet Seasoning & Care Guide',
    },
    relatedTool: {
      slug: 'cookware-material-finder',
      title: 'Cookware Material Finder',
    },
  },
  {
    id: 'fresh-herbs-storage-guide',
    title: "Expert's Guide to Fresh Herbs",
    description: 'Keep tender and woody fresh herbs crisp and vibrant for weeks with proper moisture control methods.',
    thumbnail: 'https://i.ytimg.com/vi/GJ0lNZwoAKM/hqdefault.jpg',
    duration: '3:10',
    category: 'Food Preservation',
    videoUrl: 'https://www.youtube.com/watch?v=GJ0lNZwoAKM',
    creator: "America's Test Kitchen",
    relatedTool: {
      slug: 'food-storage-calculator',
      title: 'Food Storage Shelf-Life Calculator',
    },
    relatedGuide: {
      slug: 'how-to-organize-your-refrigerator',
      title: 'Refrigerator Organization Guide',
    },
  },
  {
    id: 'unclog-any-drain-ask-toh',
    title: 'How to Unclog Any Drain',
    description: 'Plumbing expert Richard Trethewey demonstrates mechanical drain clearance techniques for sinks, tubs, and showers.',
    thumbnail: 'https://i.ytimg.com/vi/LpDLynrXln8/hqdefault.jpg',
    duration: '5:30',
    category: 'Plumbing & Drainage',
    videoUrl: 'https://www.youtube.com/watch?v=LpDLynrXln8',
    creator: 'This Old House',
    relatedGuide: {
      slug: 'how-to-unclog-a-slow-bathroom-sink',
      title: 'How to Unclog a Slow Bathroom Sink',
    },
  },
  {
    id: 'repair-stripped-screw-hole',
    title: 'How to Repair a Stripped Screw Hole',
    description: 'Tom Silva shares simple wood restoration tricks to firmly fix loose screws in doors, cabinets, and furniture.',
    thumbnail: 'https://i.ytimg.com/vi/nA0a0KJH9tA/hqdefault.jpg',
    duration: '3:50',
    category: 'Home Repair',
    videoUrl: 'https://www.youtube.com/watch?v=nA0a0KJH9tA',
    creator: 'This Old House',
    relatedGuide: {
      slug: 'small-kitchen-organization',
      title: 'Small Kitchen Storage & Shelving Guide',
    },
  },
  {
    id: 'patch-drywall-hole-guide',
    title: 'How to Patch a Drywall Hole',
    description: 'Step-by-step tutorial on creating clean drywall backing, taping, and applying joint compound smoothly.',
    thumbnail: 'https://i.ytimg.com/vi/PLGmTzEGSIY/hqdefault.jpg',
    duration: '4:15',
    category: 'Home Maintenance',
    videoUrl: 'https://www.youtube.com/watch?v=PLGmTzEGSIY',
    creator: 'This Old House',
    relatedTool: {
      slug: 'seasonal-maintenance-planner',
      title: 'Seasonal Home Maintenance Planner',
    },
  },
  {
    id: 'fold-fitted-sheet-pro',
    title: 'How to Fold a Fitted Sheet like a PRO',
    description: 'Transform bulky fitted sheets into neat, stackable rectangular bundles in under a minute.',
    thumbnail: 'https://i.ytimg.com/vi/0O3N-vbGb38/hqdefault.jpg',
    duration: '2:30',
    category: 'Organization',
    videoUrl: 'https://www.youtube.com/watch?v=0O3N-vbGb38',
    creator: 'GoCleanCo',
    relatedTool: {
      slug: 'small-space-storage-planner',
      title: 'Small Space Storage Planner',
    },
    relatedGuide: {
      slug: 'how-to-read-laundry-care-labels',
      title: 'How to Read Laundry Care Labels',
    },
  },
  {
    id: 'perfect-crispy-bacon-atk',
    title: "How to Cook Bacon So It's Crispy, Tender, and the Most Perfect Ever",
    description: 'The science-backed skillet technique using a splash of water for evenly rendered, crispy bacon.',
    thumbnail: 'https://i.ytimg.com/vi/2guC4Badq2s/hqdefault.jpg',
    duration: '3:20',
    category: 'Culinary Technique',
    videoUrl: 'https://www.youtube.com/watch?v=2guC4Badq2s',
    creator: "America's Test Kitchen",
    relatedTool: {
      slug: 'cookware-material-finder',
      title: 'Cookware Material Finder',
    },
  },
  {
    id: 'wirecutter-fitted-sheet-method',
    title: 'How to Fold a Fitted Sheet: Our Best Method',
    description: 'Wirecutter’s tested, reliable folding technique for fitted bed sheets without frustration.',
    thumbnail: 'https://i.ytimg.com/vi/JGZCyVkMhIM/hqdefault.jpg',
    duration: '1:45',
    category: 'Organization',
    videoUrl: 'https://www.youtube.com/watch?v=JGZCyVkMhIM',
    creator: 'NYT Wirecutter',
    hidden: true, // Consolidated duplicate of fold-fitted-sheet-pro
  },
  {
    id: 'replace-polybutylene-piping',
    title: 'How To Replace Polybutylene Water Piping',
    description: 'Plumbing diagnosis and replacement protocols for aging household supply lines and valves.',
    thumbnail: 'https://i.ytimg.com/vi/2ALEi8EqkGs/hqdefault.jpg',
    duration: '6:10',
    category: 'Home Plumbing',
    videoUrl: 'https://www.youtube.com/watch?v=2ALEi8EqkGs',
    creator: 'This Old House',
    relatedTool: {
      slug: 'seasonal-maintenance-planner',
      title: 'Seasonal Home Maintenance Planner',
    },
  },
  {
    id: 'patch-cracked-drywall-toh',
    title: 'How to Patch Cracked Drywall',
    description: 'Professional methods for cutting out stress cracks, applying mesh tape, and blending wall texture.',
    thumbnail: 'https://i.ytimg.com/vi/YU1z2y11KZY/hqdefault.jpg',
    duration: '4:40',
    category: 'Home Repair',
    videoUrl: 'https://www.youtube.com/watch?v=YU1z2y11KZY',
    creator: 'This Old House',
    hidden: true, // Consolidated near-duplicate of patch-drywall-hole-guide
  },
];

