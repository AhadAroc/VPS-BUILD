const fs = require('fs');
const path = require('path');

// Define the output directory
const outputDir = 'C:\\Users\\verfu\\OneDrive\\Desktop\\protectionBot\\1502\\broadcast_plish';

try {
    // Read the JSON file
    const data = JSON.parse(fs.readFileSync('c:\\Users\\verfu\\Downloads\\export.json', 'utf8'));

    // Transform developers data
    const developers = data.developers.map(dev => ({
        ...dev,
        added_at: new Date(dev.added_at)
    }));

    // Transform replies data
    const replies = data.replies.map(reply => {
        const { id, ...rest } = reply;
        return rest;
    });

    // Write the transformed data to new files
    fs.writeFileSync(path.join(outputDir, 'developers_mongo.json'), JSON.stringify(developers, null, 2));
    fs.writeFileSync(path.join(outputDir, 'replies_mongo.json'), JSON.stringify(replies, null, 2));

    console.log('Data prepared for MongoDB import');
    console.log('Files saved in:', outputDir);
} catch (error) {
    console.error('An error occurred:', error.message);
}