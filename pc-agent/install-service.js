const path = require("path");
const Service = require("node-windows").Service;

const svc = new Service({
  name: "MyceliumPCAgent",
  description: "Sends PC hardware metrics to Mycelium dashboard",
  script: path.join(__dirname, "agent.js"),
});

svc.on("install", () => {
  console.log("Service installed at:", svc.root);
  console.log("Start it from Services or run: net start MyceliumPCAgent");
  svc.start();
});

svc.on("alreadyinstalled", () => {
  console.log("Service is already installed.");
});

svc.on("error", (err) => {
  console.error("Install error:", err);
});

svc.install();
