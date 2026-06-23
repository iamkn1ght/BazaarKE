/**
 * Long-running KP Kafka consumer worker — the primary KP webhook path (KP is Kafka-only).
 * Run as a SEPARATE process, not a Vercel function:
 *   node --conditions=react-server --import tsx scripts/kp-kafka-consumer.ts
 * Requires PAYMENT_RAIL_KAFKA_BROKERS (+ optional SASL/SSL env). Blocked until KP-1-Ops deploys.
 */
import { createKpConsumer } from "../app/lib/rails/payment-rail/kafka-consumer";

async function main(): Promise<void> {
  const consumer = createKpConsumer();
  await consumer.start();
  console.log("[kp-kafka] consumer running; subscribed to kp.wallet/payment/payout events");

  const shutdown = async () => {
    console.log("[kp-kafka] shutting down");
    await consumer.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[kp-kafka] fatal:", err);
  process.exit(1);
});
