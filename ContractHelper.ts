import { broadcast, data, seedUtils, massTransfer, waitForTx, issue, setScript} from "@waves/waves-transactions"
import { DeployInfo } from "./models/NeutrinoContractAccounts";
import { readFileSync } from 'fs'
import { compile, ICompilationResult, ICompilationError } from '@waves/ride-js'

export class ContractHelper{
    static async deploy(distributorSeed, nodeUrl, chainId, dirScriptsPath, symbolNeutrino, symbolBond, descriptionNeutrino, descriptionBond, nodeAddress, removeMultisig = false, nodeOracleProvider = nodeAddress): Promise<DeployInfo>{
        let deployInfo: DeployInfo = 
        {
            accounts: {
                oracles: Array(5).fill(null).map(() => new seedUtils.Seed(seedUtils.generateNewSeed(), chainId)),
                admins: Array(5).fill(null).map(() => new seedUtils.Seed(seedUtils.generateNewSeed(),chainId)),
                auctionContract: new seedUtils.Seed(seedUtils.generateNewSeed(), chainId),
                neutrinoContract: new seedUtils.Seed(seedUtils.generateNewSeed(), chainId),
                rpdContract: new seedUtils.Seed(seedUtils.generateNewSeed(), chainId),
                controlContract: new seedUtils.Seed(seedUtils.generateNewSeed(), chainId),
                liquidationContract: new seedUtils.Seed(seedUtils.generateNewSeed(), chainId)
            },
            assets: {
                neutrinoAssetId: null,
                bondAssetId: null
            }
        }
     
        var massTx = massTransfer({
            transfers: [
                {
                    amount: 1500000,
                    recipient: deployInfo.accounts.auctionContract.address,
                },
                {
                    amount: 201500000,
                    recipient: deployInfo.accounts.neutrinoContract.address,
                },
                {
                    amount: 1500000,
                    recipient: deployInfo.accounts.rpdContract.address,
                },
                {
                    amount: 1500000,
                    recipient:  deployInfo.accounts.controlContract.address,
                },
                {
                    amount: 1500000,
                    recipient: deployInfo.accounts.liquidationContract.address
                }
               
            ],
            fee: 800000
        }, distributorSeed)

        await broadcast(massTx, nodeUrl)
        await waitForTx(massTx.id, {apiBase: nodeUrl })

        let oraclesAddress = ""
        for(let i = 0; i < deployInfo.accounts.oracles.length; i++){
            if(oraclesAddress != "")
                oraclesAddress += ","
            oraclesAddress += deployInfo.accounts.oracles[i].address
        }
        let adminsAddress = ""
        for(let i = 0; i < deployInfo.accounts.admins.length; i++){
            if(adminsAddress != "")
                adminsAddress += ","
            adminsAddress += deployInfo.accounts.admins[i].address
        }

        const issueTx = issue({
            name: symbolNeutrino,
            description: descriptionNeutrino,
            quantity: "1000000000000000000",
            decimals: 6,
            chainId: chainId
        }, deployInfo.accounts.neutrinoContract.phrase)

        deployInfo.assets.neutrinoAssetId = issueTx.id;

        const issueBondTx = issue({
            name: symbolBond,
            description: descriptionBond,
            quantity: "1000000000000",
            decimals: 0,
            chainId: chainId
        }, deployInfo.accounts.neutrinoContract.phrase);

        deployInfo.assets.bondAssetId = issueBondTx.id;
        
        
        const neutrinoDataTx = data({
            data: [
                { key: "control_contract", value: deployInfo.accounts.controlContract.address },
                { key: 'neutrino_asset_id', value: deployInfo.assets.neutrinoAssetId },
                { key: 'bond_asset_id', value: deployInfo.assets.bondAssetId },
                { key: 'auction_contract', value: deployInfo.accounts.auctionContract.address },
                { key: "min_waves_swap_amount", value: 100000000 },
                { key: "min_neutrino_swap_amount", value: 1000000 },
                { key: "balance_waves_lock_interval", value: 1 },
                { key: "balance_neutrino_lock_interval", value: 5 },
                { key: 'rpd_contract', value: deployInfo.accounts.rpdContract.address },
                { key: "liquidation_contract", value: deployInfo.accounts.liquidationContract.address },
                { key: 'node_oracle_provider', value: nodeOracleProvider}
            ],
            fee: 500000
        }, deployInfo.accounts.neutrinoContract.phrase);

        const auctionDataTx = data({
            data: [
                { key: 'neutrino_contract', value: deployInfo.accounts.neutrinoContract.address },
            ],
            fee: 500000
        }, deployInfo.accounts.auctionContract.phrase);
        
        const liquidationDataTx = data({
            data: [
                { key: 'neutrino_contract', value: deployInfo.accounts.neutrinoContract.address },
            ],
            fee: 500000
        }, deployInfo.accounts.liquidationContract.phrase);

        const controlDataTx = data({
            data: [
                { key: "price_offset", value: 1000000 },
                { key: "providing_interval", value: 5 },
                { key: 'oracles', value: oraclesAddress},
                { key: 'admins', value: adminsAddress },
                { key: 'coefficient_oracle', value: 3 },
                { key: 'coefficient_admin', value: 3 },
                { key: 'script_update_interval', value: 30 },
                { key: 'price', value: 100 }
            ],
            fee: 500000
        }, deployInfo.accounts.controlContract.phrase);

        const rpdDataTx = data({
            data: [
                { key: 'neutrino_contract', value: deployInfo.accounts.neutrinoContract.address },
            ],
            fee: 500000
        }, deployInfo.accounts.rpdContract.phrase);

    
        await broadcast(issueTx, nodeUrl);
        await broadcast(issueBondTx, nodeUrl);
        await broadcast(auctionDataTx, nodeUrl);
        await broadcast(liquidationDataTx, nodeUrl)
        await broadcast(neutrinoDataTx, nodeUrl)
        await broadcast(controlDataTx, nodeUrl);
        await broadcast(rpdDataTx, nodeUrl);

        let contracts = {
            Neutrino: readFileSync(dirScriptsPath + "neutrino.ride",'utf8'),
            Liquidation: readFileSync(dirScriptsPath + "liquidation.ride",'utf8'),
            Auction: readFileSync(dirScriptsPath + "auction.ride",'utf8'),
            Control: readFileSync(dirScriptsPath + "control.ride",'utf8'),
            Rpd: readFileSync(dirScriptsPath + "rpd.ride",'utf8')
        } 
        if (removeMultisig) {
            let keys = Object.keys(contracts)
            for (let index in keys) {
                let key = keys[index]
                let startRmIndex = contracts[key].indexOf("@Verifier")
                contracts[key] =  contracts[key].replace(contracts[key].substring(startRmIndex, contracts[key].length), "");
            }
        }

        await this.deployContract(contracts.Neutrino, nodeUrl, chainId, deployInfo.accounts.neutrinoContract.phrase)
        await this.deployContract(contracts.Liquidation, nodeUrl, chainId, deployInfo.accounts.liquidationContract.phrase)

        await this.deployContract(contracts.Auction, nodeUrl, chainId, deployInfo.accounts.auctionContract.phrase)
        await this.deployContract(contracts.Control, nodeUrl, chainId, deployInfo.accounts.controlContract.phrase)
        await this.deployContract(contracts.Rpd, nodeUrl, chainId, deployInfo.accounts.rpdContract.phrase)


        await waitForTx(issueTx.id, {apiBase: nodeUrl })
        await waitForTx(issueBondTx.id, {apiBase: nodeUrl })

        await waitForTx(auctionDataTx.id, {apiBase: nodeUrl })
        await waitForTx(liquidationDataTx.id, {apiBase: nodeUrl })
        await waitForTx(neutrinoDataTx.id, {apiBase: nodeUrl });
        await waitForTx(controlDataTx.id, {apiBase: nodeUrl });
        await waitForTx(rpdDataTx.id, {apiBase: nodeUrl });

        return deployInfo;
    }
    static async deployContract(file: string, nodeUrl: any, chainId: any, phrase: string) {
        const contract =  await compile(file);
        if ((<ICompilationError>contract).error != undefined)
            console.log((<ICompilationError>contract).error)
        const contractTx = setScript({ script: (<ICompilationResult>contract).result.base64, fee: 1000000, chainId: chainId }, phrase);    
        await broadcast(contractTx, nodeUrl);
        await waitForTx(contractTx.id, {apiBase: nodeUrl })
    }
}