// Mock data for development - will be replaced with real API calls

export interface Photo {
  id: string;
  src: string;
  thumbnail: string;
  width: number;
  height: number;
  alt: string;
  takenAt: string;
  metadata: {
    camera?: string;
    lens?: string;
    iso?: number;
    aperture?: string;
    shutterSpeed?: string;
    focalLength?: string;
    location?: string;
  };
}

export interface Album {
  id: string;
  title: string;
  description?: string;
  coverPhoto: string;
  photoCount: number;
  createdAt: string;
  dateDisplay: string;
  isPrivate: boolean;
}

// High-quality Unsplash photos for realistic mockups
const unsplashPhotos = [
  { id: "1", query: "mountain-landscape", w: 1600, h: 1200 },
  { id: "2", query: "ocean-sunset", w: 1200, h: 1600 },
  { id: "3", query: "city-night", w: 1600, h: 1067 },
  { id: "4", query: "forest-fog", w: 1600, h: 1200 },
  { id: "5", query: "desert-dunes", w: 1200, h: 1600 },
  { id: "6", query: "northern-lights", w: 1600, h: 1067 },
  { id: "7", query: "waterfall", w: 1600, h: 1200 },
  { id: "8", query: "cherry-blossom", w: 1200, h: 1600 },
  { id: "9", query: "snowy-peaks", w: 1600, h: 1067 },
  { id: "10", query: "tropical-beach", w: 1600, h: 1200 },
  { id: "11", query: "autumn-forest", w: 1200, h: 1600 },
  { id: "12", query: "starry-night", w: 1600, h: 1067 },
];

const cameras = [
  "Sony A7R IV",
  "Canon EOS R5",
  "Nikon Z8",
  "Fujifilm X-T5",
  "Leica Q3",
];

const lenses = [
  "24-70mm f/2.8",
  "70-200mm f/2.8",
  "35mm f/1.4",
  "85mm f/1.2",
  "14-24mm f/2.8",
];

export const mockPhotos: Photo[] = unsplashPhotos.map((photo, index) => ({
  id: photo.id,
  src: `https://images.unsplash.com/photo-${1500000000000 + index * 100000}?w=${
    photo.w
  }&h=${photo.h}&fit=crop&auto=format&q=90`,
  thumbnail: `https://images.unsplash.com/photo-${
    1500000000000 + index * 100000
  }?w=400&h=400&fit=crop&auto=format&q=80`,
  width: photo.w,
  height: photo.h,
  alt: photo.query.replace("-", " "),
  takenAt: new Date(
    2024,
    Math.floor(index / 3),
    (index % 28) + 1
  ).toISOString(),
  metadata: {
    camera: cameras[index % cameras.length],
    lens: lenses[index % lenses.length],
    iso: [100, 200, 400, 800, 1600][index % 5],
    aperture: ["f/1.4", "f/2.8", "f/4", "f/5.6", "f/8"][index % 5],
    shutterSpeed: ["1/1000", "1/500", "1/250", "1/125", "1/60"][index % 5],
    focalLength: ["24mm", "35mm", "50mm", "85mm", "135mm"][index % 5],
    location:
      index % 3 === 0 ? "Iceland" : index % 3 === 1 ? "Japan" : "California",
  },
}));

// Use picsum.photos for reliable placeholder images
export const generatePhotoUrl = (id: string, width: number, height: number) =>
  `https://picsum.photos/seed/${id}/${width}/${height}`;

export const generateThumbnailUrl = (id: string) =>
  `https://picsum.photos/seed/${id}/400/400`;

// Generate realistic mock photos using picsum
export const generateMockPhotos = (count: number, albumId: string): Photo[] => {
  return Array.from({ length: count }, (_, i) => {
    const id = `${albumId}-${i}`;
    const isPortrait = Math.random() > 0.6;
    const width = isPortrait ? 1200 : 1600;
    const height = isPortrait ? 1600 : 1200;

    return {
      id,
      src: generatePhotoUrl(id, width, height),
      thumbnail: generateThumbnailUrl(id),
      width,
      height,
      alt: `Photo ${i + 1}`,
      takenAt: new Date(
        2024,
        Math.floor(Math.random() * 12),
        Math.floor(Math.random() * 28) + 1
      ).toISOString(),
      metadata: {
        camera: cameras[Math.floor(Math.random() * cameras.length)],
        lens: lenses[Math.floor(Math.random() * lenses.length)],
        iso: [100, 200, 400, 800, 1600][Math.floor(Math.random() * 5)],
        aperture: ["f/1.4", "f/2.8", "f/4", "f/5.6", "f/8"][
          Math.floor(Math.random() * 5)
        ],
        shutterSpeed: ["1/1000", "1/500", "1/250", "1/125", "1/60"][
          Math.floor(Math.random() * 5)
        ],
        focalLength: ["24mm", "35mm", "50mm", "85mm", "135mm"][
          Math.floor(Math.random() * 5)
        ],
        location: ["Iceland", "Japan", "California", "Norway", "New Zealand"][
          Math.floor(Math.random() * 5)
        ],
      },
    };
  });
};

export const mockAlbums: Album[] = [
  {
    id: "iceland-2024",
    title: "Iceland Adventure",
    description: "Northern lights, glaciers, and volcanic landscapes",
    coverPhoto: generatePhotoUrl("iceland-cover", 800, 600),
    photoCount: 24,
    createdAt: "2024-03-15",
    dateDisplay: "2024-03-10",
    isPrivate: false,
  },
  {
    id: "tokyo-spring",
    title: "Tokyo in Spring",
    description: "Cherry blossoms and city life",
    coverPhoto: generatePhotoUrl("tokyo-cover", 800, 600),
    photoCount: 36,
    createdAt: "2024-04-02",
    dateDisplay: "2024-03-28",
    isPrivate: false,
  },
  {
    id: "california-coast",
    title: "California Coast",
    description: "Pacific Highway road trip",
    coverPhoto: generatePhotoUrl("california-cover", 800, 600),
    photoCount: 18,
    createdAt: "2024-05-20",
    dateDisplay: "2024-05-15",
    isPrivate: false,
  },
  {
    id: "norway-fjords",
    title: "Norwegian Fjords",
    description: "Dramatic landscapes and midnight sun",
    coverPhoto: generatePhotoUrl("norway-cover", 800, 600),
    photoCount: 42,
    createdAt: "2024-06-10",
    dateDisplay: "2024-06-01",
    isPrivate: true,
  },
  {
    id: "new-zealand",
    title: "New Zealand",
    description: "Mountains, lakes, and adventure",
    coverPhoto: generatePhotoUrl("nz-cover", 800, 600),
    photoCount: 55,
    createdAt: "2024-07-25",
    dateDisplay: "2024-07-18",
    isPrivate: false,
  },
  {
    id: "patagonia",
    title: "Patagonia",
    description: "End of the world landscapes",
    coverPhoto: generatePhotoUrl("patagonia-cover", 800, 600),
    photoCount: 31,
    createdAt: "2024-08-15",
    dateDisplay: "2024-08-10",
    isPrivate: false,
  },
];

// Get photos for a specific album
export const getAlbumPhotos = (albumId: string): Photo[] => {
  const album = mockAlbums.find((a) => a.id === albumId);
  if (!album) return [];
  return generateMockPhotos(album.photoCount, albumId);
};

// Get album by ID
export const getAlbum = (albumId: string): Album | undefined => {
  return mockAlbums.find((a) => a.id === albumId);
};
