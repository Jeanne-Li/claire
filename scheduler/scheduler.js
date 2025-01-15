// const axios = require('axios'); // Importing axios for making HTTP requests
// const cron = require('node-cron'); // Importing node-cron for scheduling tasks

// URL to trigger the scraper
// const scraperTriggerUrl = 'http://scraper-presse-citron:3001/trigger'; // Endpoint to start the scraper

// Scheduler configuration
// const cronConfig = {
//   days: 0, // Not used in current configuration
//   hours: 3, // Every 3 hours
//   minutes: 0, // At the start of the hour
//   seconds: 0 // At the start of the minute
// };

// Convert configuration to cron format
// function getCronSchedule(config) {
//   const secondPart = '0'; // Run at second 0 of every minute
//   const minutePart = config.minutes.toString().padStart(2, '0'); // Run at minute 0
//   const hourPart = `*/${config.hours}`; // Every 3 hours
//   const dayPart = '*'; // Every day

//   return `${secondPart} ${minutePart} ${hourPart} ${dayPart} * *`; // Constructing cron expression
// }

// const scraperTriggerSchedule = getCronSchedule(cronConfig); // Get the cron schedule string

// Function to trigger scraper
// async function triggerScraper() {
//   try {
//     const response = await axios.post(scraperTriggerUrl); // Sending POST request to trigger scraper
//     console.log('Scraper triggered:', response.data); // Log success message
//   } catch (error) {
//     console.error('Error triggering scraper:', error); // Log error message
//   }
// }

// Schedule cron job to trigger the scraper
// cron.schedule(scraperTriggerSchedule, () => {
//   console.log('Running scheduled job to trigger scraper'); // Log when job is running
//   triggerScraper(); // Call function to trigger scraper
// });

// console.log('Scheduler started'); // Log when scheduler starts
