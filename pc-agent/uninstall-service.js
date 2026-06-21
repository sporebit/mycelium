const path = require("path");
const Service = require("node-windows").Service;

const svc = new Service({
  name: "MyceliumPCAgent",
  script: path.join(__dirname, "agent.js"),
});

svc.on("uninstall", () => {
  console.log("Service uninstalled successfully.");
});

svc.on("error", (err) => {
  console.error("Uninstall error:", err);
});

svc.uninstall();
