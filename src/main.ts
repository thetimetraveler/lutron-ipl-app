import { readOptionsFile, validateCredentials } from "./config.js";
import { levelEvent } from "./ipl.js";
import { startTransport } from "./transport.js";
import { createPublisher } from "./mqtt.js";
import { resolveBroker } from "./supervisor.js";
import { startApp } from "./runtime.js";

function main():void {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==="--help") {
    console.log("Lutron IPL Events\nUsage: node dist/main.js [--config OPTIONS_JSON] [--check-config]\nEnvironment: IPL_OPTIONS_FILE, IPL_CREDENTIAL_DIR, IPL_DATA_DIR\nRead-only observer; UI reports do not prove fresh touches.");
    return;
  }
  let configFile=process.env.IPL_OPTIONS_FILE??"/data/options.json",check=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==="--config"&&args[i+1]) configFile=args[++i];
    else if(args[i]==="--check-config") check=true;
    else throw new Error("Invalid arguments; use --help");
  }
  const config=readOptionsFile(configFile,{credentialDir:process.env.IPL_CREDENTIAL_DIR,dataDir:process.env.IPL_DATA_DIR});
  const credentials=validateCredentials(config);
  if(check){console.log("IPL options and credentials validated; no connections opened");return;}
  const log=(message:string)=>console.log(`[ipl-app] ${message}`);
  log(config.expected_server_name||config.expected_server_ip
    ? "TLS requires CA trust and the configured expected certificate identity"
    : "TLS compatibility mode verifies CA trust only, not processor hostname/IP identity");
  const app=startApp(config,credentials,{resolveBroker,createPublisher,startTransport,levelEvent,log});
  const stop=()=>{void app.stop().finally(()=>process.exit(0));};
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  void app.ready;
}

try { main(); } catch(error) {
  // Configuration validators use fixed field/error messages and never interpolate values.
  console.error(`[ipl-app] ${error instanceof Error?error.message:"Unable to start IPL app"}`);
  process.exitCode=1;
}
