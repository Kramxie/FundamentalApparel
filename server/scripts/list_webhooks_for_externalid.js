const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const externalId = argv.externalId || argv.id || argv.session;

if (!externalId) { console.error('Usage: node list_webhooks_for_externalid.js --externalId <externalId>'); process.exit(2); }

async function main() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(3); }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const collNames = (await db.listCollections().toArray()).map(c => c.name);
  const whName = collNames.find(n => n.toLowerCase().includes('webhook')) || 'webhookevents';
  const whCol = db.collection(whName);
  const docs = await whCol.find({ externalId: externalId }).sort({ createdAt: 1 }).toArray();
  console.log('Using webhook collection:', whName, 'Found', docs.length, 'docs for externalId', externalId);
  docs.forEach(d => console.log(JSON.stringify({ _id: d._id, externalId: d.externalId, eventType: d.eventType, processed: d.processed, verified: d.verified, createdAt: d.createdAt, processedAt: d.processedAt }, null, 2)));
  await mongoose.disconnect(); process.exit(0);
}

main().catch(e => { console.error(e && e.stack); process.exit(99); });