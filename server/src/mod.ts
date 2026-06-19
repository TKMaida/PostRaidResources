import { DependencyContainer } from "tsyringe";

import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { IBodyPart, IHealthTreatmentRequestData } from "@spt/models/eft/health/IHealthTreatmentRequestData";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Traders } from "@spt/models/enums/Traders";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { IGlobals } from "@spt/models/eft/common/IGlobals";
import { IProcessBuyTradeRequestData } from "@spt/models/eft/trade/IProcessBuyTradeRequestData";

import { HealthController } from "@spt/controllers/HealthController";

import { EventOutputHolder } from "@spt/routers/EventOutputHolder";

import { PaymentService } from "@spt/services/PaymentService";

import { ICloner } from "@spt/utils/cloners/ICloner";

import { DatabaseServer } from "@spt/servers/DatabaseServer";

import path from "node:path";
import fs from 'fs'

interface PRRConfig
{
    "hydrationPointPrice": number,
    "energyPointPrice": number,
    "healthPointPrice": number
}


class PostRaidResources implements IPreSptLoadMod, IPostDBLoadMod
{
    
    private modName : string = "TKMaida-PostRaidResources";
    private modDir : string = path.join(process.cwd(), "//user//mods//", this.modName)
    private configDir : string = path.join(this.modDir, "//config//config.json");

    readonly defaultConfig : PRRConfig = 
    {
        "hydrationPointPrice": 15,
        "energyPointPrice": 15,
        "healthPointPrice": 30
    }
    private config : PRRConfig = this.defaultConfig;

    private static container : DependencyContainer;
    private PrefixLogger = class
    {
        logger: ILogger;
        prefixString : string;
        
        constructor(logger : ILogger, prefixString : string)
        {
            this.logger = logger;
            this.prefixString = prefixString; 
        }
        info(data : string) : void
        {
            this.logger.info(`${this.prefixString} ${data}`);
        }
        warning(data : string) : void
        {
            this.logger.warning(`${this.prefixString} ${data}`);
        }
        error(data : string) : void
        {
            this.logger.error(`${this.prefixString} ${data}`);
        }
    }
    private logger !: 
    {
        info(data: string): void;
        warning(data: string): void;
        error(data: string): void;
    };
    
    
    public preSptLoad(container: DependencyContainer): void
    {
        PostRaidResources.container = container;
        
        this.logger = new this.PrefixLogger(container.resolve<ILogger>("WinstonLogger"), "[TKMaida-PostRaidResources]");
        this.config = this.loadConfig();

        this.logger.info(`Config loaded: ${JSON.stringify(this.config, undefined, 4)}`)

        container.afterResolution("HealthController", (_t, result) =>
        {
        
            const healthController = result as HealthController;

            healthController.healthTreatment = (pmcData: IPmcData, healthTreatmentRequest: IHealthTreatmentRequestData, sessionID: string) =>
            {
                return this.healthTreatmentModified(pmcData, healthTreatmentRequest, sessionID);
            }

        }, {frequency: "Always"});

    }
    public loadConfig() : PRRConfig
    {
        if (fs.existsSync(this.configDir))
        {
            try
            {
                
                return JSON.parse(fs.readFileSync(this.configDir, "utf-8")) as PRRConfig;
            } 
            catch (error : any) 
            {
                this.logger.error(`Failed to parse config file at ${this.configDir} ${error.stack}`)
                this.logger.warning("Malformed config file, fallback to default config");
                return this.defaultConfig;
            }
           
        }
        else
        {
            this.logger.info(`Config file not found, attempting to create file at ${this.configDir}`)
            
            try
            {
                fs.mkdirSync(path.dirname(this.configDir), {recursive: true})
                fs.writeFileSync(this.configDir, JSON.stringify(this.defaultConfig));
                return this.defaultConfig;
            }
            catch (error : any)
            {
                this.logger.error(`Failed to create config file at ${this.configDir}: ${error.stack}`);
                return this.defaultConfig;
            }
        }
    }

    public postDBLoad(container: DependencyContainer): void {
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");

        const tables: IDatabaseTables = databaseServer.getTables();
        const globals : IGlobals = tables.globals as IGlobals;
        
        globals.config.Health.HealPrice.EnergyPointPrice = this.config.energyPointPrice;
        globals.config.Health.HealPrice.HydrationPointPrice = this.config.hydrationPointPrice;
        globals.config.Health.HealPrice.HealthPointPrice = this.config.healthPointPrice;

        this.logger.info(`Globals updated, EnergyPointPrice: ${globals.config.Health.HealPrice.EnergyPointPrice}, HydrationPointPrice ${globals.config.Health.HealPrice.HydrationPointPrice} HealthPointPrice ${globals.config.Health.HealPrice.HealthPointPrice}`);

    }

    public healthTreatmentModified(pmcData: IPmcData, healthTreatmentRequest: IHealthTreatmentRequestData, sessionID: string) : IItemEventRouterResponse
    {
        const eventOutputHolder = PostRaidResources.container.resolve<EventOutputHolder>("EventOutputHolder");
        const paymentService = PostRaidResources.container.resolve<PaymentService>("PaymentService");
        const cloner = PostRaidResources.container.resolve<ICloner>("PrimaryCloner");

        const output = eventOutputHolder.getOutput(sessionID);
        const payMoneyRequest: IProcessBuyTradeRequestData = {
            Action: healthTreatmentRequest.Action,
            tid: Traders.THERAPIST,
            scheme_items: healthTreatmentRequest.items,
            type: "",
            item_id: "",
            count: 0,
            scheme_id: 0,
        };

        // payMoneyRequest.scheme_items.forEach(element => {
        //     this.logger.info(`Scheme_item ${element.id} with count ${element.count}`)
        // });

        paymentService.payMoney(pmcData, payMoneyRequest, sessionID, output);

        pmcData.Health.Hydration.Current = pmcData.Health.Hydration.Maximum;
        pmcData.Health.Energy.Current = pmcData.Health.Energy.Maximum;

        if (output.warnings.length > 0) 
        {
            return output
        }

        for (const bodyPartKey in healthTreatmentRequest.difference.BodyParts) 
        {
            // Get body part from request + from pmc profile

            const partRequest: IBodyPart = healthTreatmentRequest.difference.BodyParts[bodyPartKey];
            const profilePart = pmcData.Health.BodyParts[bodyPartKey];
            

            // Bodypart healing is chosen when part request hp is above 0
            if (partRequest.Health > 0) 
            {
                // Heal bodypart
                profilePart.Health.Current = profilePart.Health.Maximum;
            }

            // Check for effects to remove
            if (partRequest.Effects?.length > 0) 
            {
                // Found some, loop over them and remove from pmc profile
                for (const effect of partRequest.Effects) 
                {
                    delete pmcData.Health.BodyParts[bodyPartKey].Effects[effect];
                }

                // Remove empty effect object
                if (Object.keys(pmcData.Health.BodyParts[bodyPartKey].Effects).length === 0) 
                {
                    // biome-ignore lint/performance/noDelete: Delete is fine here as we entirely want to get rid of the effect.
                    delete pmcData.Health.BodyParts[bodyPartKey].Effects;
                }
            }
        }

        // Inform client of new post-raid, post-therapist heal values
        output.profileChanges[sessionID].health = cloner.clone(pmcData.Health);

        return output; 
    }

}

export const mod = new PostRaidResources();
