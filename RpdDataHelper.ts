import { broadcast, data, seedUtils, massTransfer, waitForTx, issue, setScript} from "@waves/waves-transactions"
import { Seed } from "@waves/waves-transactions/dist/seedUtils";

let args = process.argv.slice(2);
let neutrinoSeed = args[0];
let rpdSeed = args[1];
let neutrinoAssetId = args[2];
let nodeUrl = args[3]
let chainId = args[4]
const neutrinoDataTx = data({
    data: [
        { key: 'neutrino_asset_id', value: neutrinoAssetId },
    ],
    fee: 500000
}, neutrinoSeed);
        
const rpdDataTx = data({
    data: [
        { key: 'neutrino_contract', value: (new Seed(neutrinoSeed, chainId)).address },
    ],
    fee: 500000
}, rpdSeed);

broadcast(neutrinoDataTx, nodeUrl)
broadcast(rpdDataTx, nodeUrl);