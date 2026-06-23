import "server-only";
import { Kafka, type Consumer, type KafkaConfig } from "kafkajs";
import { dispatchKpEvent } from "./handlers";
import type { KpEvent } from "./types";

/**
 * KP Kafka consumer — the PRIMARY webhook path (KP is Kafka-only today). Money Rule: main-loop only.
 *
 * This is a LONG-RUNNING process and CANNOT run as a Vercel serverless function — run it as a
 * separate worker (scripts/kp-kafka-consumer.ts on a container / Railway / a dedicated dyno).
 * The Kafka offset is the dedup primitive on this path; dispatchKpEvent also dedups via KV.
 *
 * Blocked until KP-1-Ops deploys and delivers Kafka broker creds + topic ACLs for
 * unique_accessories (see OPERATOR_REQUEST_KP.md).
 */

const TOPICS = ["kp.wallet.events", "kp.payment.events", "kp.payout.events"];
const GROUP_ID = "unique_accessories.kp.events.consumer";

export interface KpConsumerHandle {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createKpConsumer(): KpConsumerHandle {
  const brokers = (process.env.PAYMENT_RAIL_KAFKA_BROKERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (brokers.length === 0) {
    throw new Error("RAIL_CONFIG_INCOMPLETE: payment-rail kafka (need PAYMENT_RAIL_KAFKA_BROKERS)");
  }

  const config: KafkaConfig = {
    clientId: "unique_accessories",
    brokers,
    ssl: process.env.PAYMENT_RAIL_KAFKA_SSL !== "false",
  };
  const username = process.env.PAYMENT_RAIL_KAFKA_USERNAME;
  if (username) {
    config.sasl = {
      mechanism: "scram-sha-256",
      username,
      password: process.env.PAYMENT_RAIL_KAFKA_PASSWORD ?? "",
    };
  }

  const kafka = new Kafka(config);
  const consumer: Consumer = kafka.consumer({ groupId: GROUP_ID });

  return {
    async start() {
      await consumer.connect();
      for (const topic of TOPICS) {
        await consumer.subscribe({ topic, fromBeginning: false });
      }
      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          if (!message.value) return;
          let event: KpEvent;
          try {
            event = JSON.parse(message.value.toString());
          } catch {
            console.error(`[kp-kafka] non-JSON message on ${topic}; skipping`);
            return; // commit offset (poison message) — do not block the partition
          }
          await dispatchKpEvent(event);
        },
      });
    },
    async stop() {
      await consumer.disconnect();
    },
  };
}
