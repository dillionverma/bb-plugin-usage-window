import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { Monitor } from "./monitor";
import { useSnapshot } from "./use-snapshot";
import "./app.css";
function LiveMonitor() {
  const { snapshot, now, refresh, refreshing } = useSnapshot();
  return (
    <Monitor
      snapshot={snapshot}
      now={now}
      onRefresh={refresh}
      refreshing={refreshing}
    />
  );
}
export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "pool-monitor",
    component: LiveMonitor,
  });
});
