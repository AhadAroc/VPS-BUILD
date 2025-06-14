module.exports = {
  apps: [{
    name: 'clone-bot',
    script: 'clone_bt.js',
    env: {
      MONGO_URI: 'mongodb+srv://Amr:NidisuSI@cluster0.ay6fa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
    }
  }]
};
