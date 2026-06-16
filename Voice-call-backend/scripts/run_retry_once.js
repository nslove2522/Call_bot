(async () => {
  try {
    const scheduler = require('../scheduler');
    if (scheduler && typeof scheduler.processRetries === 'function') {
      console.log('Running scheduler.processRetries() once...');
      await scheduler.processRetries();
      console.log('Scheduler run complete');
      process.exit(0);
    } else {
      console.error('scheduler.processRetries not found');
      process.exit(2);
    }
  } catch (e) {
    console.error('Error running scheduler once', e);
    process.exit(1);
  }
})();
