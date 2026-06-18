import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { QdrantService } from "../src/modules/memory/qdrant.service";
import { EmbeddingsService } from "../src/modules/memory/embeddings.service";
import { Logger } from "@nestjs/common";

const logger = new Logger("SeedQdrant");

const MOCK_HOTELS = [
  {
    id: "h1",
    name: "Hotel Eiffel Seine",
    description:
      "A beautiful boutique hotel located just 5 minutes walking distance from the Eiffel Tower, featuring stylish rooms and free WiFi.",
    payload: {
      id: "h1",
      name: "Hotel Eiffel Seine",
      address: "3 Avenue de Suffren, 75007 Paris, France",
      stars: 4,
      coordinates: { lat: 48.8558, lng: 2.2926 },
      pricePerNight: 18000,
      amenities: ["wifi", "bar", "air_conditioning", "city-center"],
      bookingRef: "ref-hotel-eiffel-seine",
    },
  },
  {
    id: "h2",
    name: "Pullman Paris Tour Eiffel",
    description:
      "Luxury hotel near the Eiffel Tower with stunning views of the tower, a modern fitness center, and an onsite restaurant serving French cuisine.",
    payload: {
      id: "h2",
      name: "Pullman Paris Tour Eiffel",
      address: "18 Avenue de Suffren, 75015 Paris, France",
      stars: 4,
      coordinates: { lat: 48.854, lng: 2.2915 },
      pricePerNight: 24000,
      amenities: ["wifi", "gym", "restaurant", "bar", "pool", "city-center"],
      bookingRef: "ref-pullman-eiffel",
    },
  },
  {
    id: "h3",
    name: "Generator Paris",
    description:
      "A stylish designer hostel in the lively 10th district of Paris with a rooftop terrace overlooking Sacre-Coeur.",
    payload: {
      id: "h3",
      name: "Generator Paris",
      address: "9-11 Place du Colonel Fabien, 75010 Paris, France",
      stars: 2,
      coordinates: { lat: 48.8786, lng: 2.3708 },
      pricePerNight: 4500,
      amenities: ["wifi", "rooftop", "bar", "laundry"],
      bookingRef: "ref-generator-paris",
    },
  },
];

const MOCK_ACTIVITIES = [
  {
    id: "a1",
    name: "Louvre Museum Guided Tour",
    description:
      "Skip the line and enjoy a 2-hour guided tour of the famous Louvre Museum to see the Mona Lisa, Venus de Milo, and other historic art masterpieces.",
    payload: {
      id: "a1",
      name: "Louvre Museum Guided Tour",
      type: "excursion",
      cost: 5500,
      location: "Louvre Museum, Rue de Rivoli, 75001 Paris, France",
      bookingRequired: true,
      notes: "Skip-the-line access. Tour starts at 10:00 AM.",
    },
  },
  {
    id: "a2",
    name: "Paris Food & Wine Tasting Tour",
    description:
      "Explore the culinary secrets of Paris on a walking food tour through the historic Le Marais district. Taste French cheeses, pastries, and fine wines.",
    payload: {
      id: "a2",
      name: "Paris Food & Wine Tasting Tour",
      type: "restaurant",
      cost: 9500,
      location: "Le Marais, 75004 Paris, France",
      bookingRequired: true,
      notes:
        "Includes 6 food stops and wine pairing. Wear comfortable walking shoes.",
    },
  },
  {
    id: "a3",
    name: "Seine River Evening Cruise",
    description:
      "A relaxing 1-hour cruise along the Seine River in the evening, showing the illuminated Eiffel Tower, Notre Dame, and iconic Paris bridges.",
    payload: {
      id: "a3",
      name: "Seine River Evening Cruise",
      type: "attraction",
      cost: 2200,
      location:
        "Bateaux Parisiens, Port de la Bourdonnais, 75007 Paris, France",
      bookingRequired: false,
      notes: "Audio guide included. Cruises depart every 30 minutes.",
    },
  },
];

async function run() {
  logger.log("Starting Qdrant seeding script...");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const qdrantService = app.get(QdrantService);
    const embeddingsService = app.get(EmbeddingsService);

    logger.log("Seeding mock hotels into Qdrant...");
    const hotelPoints = [];
    for (const hotel of MOCK_HOTELS) {
      const vector = await embeddingsService.embedQuery(hotel.description);
      hotelPoints.push({
        id: hotel.id,
        vector,
        payload: hotel.payload,
      });
    }
    await qdrantService.upsert("hotels", hotelPoints);
    logger.log(`Successfully seeded ${hotelPoints.length} hotels.`);

    logger.log("Seeding mock activities into Qdrant...");
    const activityPoints = [];
    for (const activity of MOCK_ACTIVITIES) {
      const vector = await embeddingsService.embedQuery(activity.description);
      activityPoints.push({
        id: activity.id,
        vector,
        payload: activity.payload,
      });
    }
    await qdrantService.upsert("activities", activityPoints);
    logger.log(`Successfully seeded ${activityPoints.length} activities.`);

    logger.log("Seeding complete!");
  } catch (error) {
    logger.error("Error seeding Qdrant data:", error);
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  logger.error("Unhandled script error:", err);
  process.exit(1);
});
