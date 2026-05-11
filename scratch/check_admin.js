
const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = JSON.parse(fs.readFileSync('./serviceAccountKey.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function testAdminQuery() {
  try {
    console.log('--- Admin Firestore Query Test ---');
    const meetingsColl = db.collection('meetings');
    
    // Test available years calculation
    const yearsSet = new Set();
    const yearsSnapshot = await meetingsColl.select('dateTime').get();
    console.log('Years snapshot size:', yearsSnapshot.size);
    yearsSnapshot.forEach(doc => {
      const dt = doc.data().dateTime;
      if (dt) {
        const date = dt.toDate ? dt.toDate() : new Date(dt);
        if (!isNaN(date.getTime())) yearsSet.add(date.getFullYear());
      }
    });
    console.log('Available years:', Array.from(yearsSet));

    // Test main query (Admin branch)
    console.log('Executing main query...');
    const finalQuery = meetingsColl.orderBy('dateTime', 'desc').limit(9);
    const snapshot = await finalQuery.get();
    console.log('Main query results count:', snapshot.size);
    snapshot.forEach(doc => {
      console.log(' - Meeting:', doc.id, doc.data().name, doc.data().dateTime?.toDate?.());
    });

    // Test count
    const countSnap = await meetingsColl.count().get();
    console.log('Total count from server:', countSnap.data().count);

  } catch (err) {
    console.error('Query failed:', err);
  } finally {
    process.exit(0);
  }
}

testAdminQuery();
