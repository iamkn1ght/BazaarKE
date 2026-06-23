import "server-only";
import { createClient } from "next-sanity";
import { sanityApiVersion, sanityDataset, sanityProjectId } from "./sanity";

let cached: ReturnType<typeof createClient> | null = null;

export function getWriteClient() {
    if (cached) return cached;
    const token = process.env.SANITY_API_TOKEN;
    if (!token) {
        throw new Error("SANITY_API_TOKEN is required to persist orders. Create a token with write access in Sanity dashboard.");
    }
    cached = createClient({
        projectId: sanityProjectId,
        dataset: sanityDataset,
        apiVersion: sanityApiVersion,
        useCdn: false,
        token,
    });
    return cached;
}
