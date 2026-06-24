using Microsoft.AspNetCore.Mvc.ApplicationParts;
using SPTarkov.DI.Annotations;
using SPTarkov.Reflection.Patching;
using SPTarkov.Server.Core.Controllers;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Helpers;
using SPTarkov.Server.Core.Models.Common;
using SPTarkov.Server.Core.Models.Eft.Common;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Eft.Health;
using SPTarkov.Server.Core.Models.Eft.ItemEvent;
using SPTarkov.Server.Core.Models.Logging;
using SPTarkov.Server.Core.Models.Spt.Mod;
using SPTarkov.Server.Core.Models.Utils;
using SPTarkov.Server.Core.Servers;
using SPTarkov.Server.Core.Utils;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Serialization;
using Path = System.IO.Path;

namespace PostRaidResources;

public record ModMetadata : AbstractModMetadata
{
    public override string ModGuid { get; init; } = "com.tkmaida.postraidresources";
    public override string Name { get; init; } = "PostRaidResources";
    public override string Author { get; init; } = "TKMaida";
    public override List<string>? Contributors { get; init; }
    public override SemanticVersioning.Version Version { get; init; } = new("2.0.0");
    public override SemanticVersioning.Range SptVersion { get; init; } = new("~4.0.0");
    
    
    public override List<string>? Incompatibilities { get; init; }
    public override Dictionary<string, SemanticVersioning.Range>? ModDependencies { get; init; }
    public override string? Url { get; init; }
    public override bool? IsBundleMod { get; init; }
    public override string License { get; init; } = "MIT";
}
public record ModConfig
{
    public int HealthPointPrice { get; set; } = 30;
    public int HydrationPointPrice { get; set; } = 15;
    public int EnergyPointPrice { get; set; } = 15;

}

public class PrefixLogger<T>
{
    private readonly ISptLogger<T> _logger;
    private readonly string _prefixString; 
    public PrefixLogger(ISptLogger<T> logger, string prefixString) 
    {
        _logger = logger;
        _prefixString = prefixString;
    }   
    public void Success(string data, Exception? ex = null)
    {
        _logger.Success($"{_prefixString} {data}", ex);
    }
    public void Warning(string data, Exception? ex = null)
    {
        _logger.Warning($"{_prefixString} {data}", ex);
    }
    public void Error(string data, Exception? ex = null)
    {
        _logger.Error($"{_prefixString} {data}", ex);
    }
    public void Info(string data, Exception? ex = null)
    {
        _logger.Info($"{_prefixString} {data}", ex);
    }

}

[Injectable(TypePriority = OnLoadOrder.PostDBModLoader + 1)]
public class PostRaidResourcesMod(
    ISptLogger<App> logger,
    DatabaseServer databaseServer,
    ModHelper modHelper) : IOnLoad
{
    public ModConfig Config { get; set; } = new ModConfig();
    public static PrefixLogger<App> Logger { get; private set; } = null!;
    public HealthTreatmentPatch Patch { get; } = new();
    public class HealthTreatmentPatch : AbstractPatch
    {
        protected override MethodBase GetTargetMethod()
        {
            return typeof(HealthController).GetMethod(nameof(HealthController.HealthTreatment));
        }

        [PatchPostfix]
        public static void Postfix(
            PmcData pmcData,
            HealthTreatmentRequestData healthTreatmentRequest,
            MongoId sessionID,
            ItemEventRouterResponse __result)
        {
            pmcData.Health.Hydration.Current = pmcData.Health.Hydration.Maximum;
            pmcData.Health.Energy.Current = pmcData.Health.Energy.Maximum;

            Logger.Success("HealthTreatment patch successful!");
        }
    }
    public ModConfig LoadConfig()
    {
        string assemblyPath = modHelper.GetAbsolutePathToModFolder(Assembly.GetExecutingAssembly());
        string configPath = Path.Join(assemblyPath, "config.json");
        ModConfig config = new();
        
        if (File.Exists(configPath))
        {
            try
            {
                config = modHelper.GetJsonDataFromFile<ModConfig>(assemblyPath, "config.json");
                return config;
            }
            catch (Exception ex)
            {
                Logger.Error($"Failed to parse config file at {configPath} {ex.StackTrace}");
                Logger.Warning("Malformed config file, fallback to default config");
                return config;
            }
        }
        else
        {
            Logger.Info($"Config file not found, attempting to create file at {configPath}");
            try
            {
                File.WriteAllText(configPath, JsonSerializer.Serialize<ModConfig>(config, new JsonSerializerOptions { WriteIndented = true }));
                return config;
            }
            catch (Exception ex)
            {
                Logger.Error($"Failed to write config file at {configPath} {ex.StackTrace}");
                return config;
            }
            
        }
        
    }
    Task IOnLoad.OnLoad()
    {


        Logger = new(logger, "[TKMaida-PostRaidResources]");
        Config = LoadConfig();

        Globals globals = databaseServer.GetTables().Globals;
        globals.Configuration.Health.HealPrice.HealthPointPrice = Config.HealthPointPrice;
        globals.Configuration.Health.HealPrice.EnergyPointPrice = Config.EnergyPointPrice;
        globals.Configuration.Health.HealPrice.HydrationPointPrice = Config.HydrationPointPrice;

        Logger.Info($"Config loaded: {Config.ToString()}");
        Logger.Info($"Globals updated, HealthPointPrice: {globals.Configuration.Health.HealPrice.HealthPointPrice} EnergyPointPrice: {globals.Configuration.Health.HealPrice.EnergyPointPrice} HydrationPointPrice: {globals.Configuration.Health.HealPrice.HydrationPointPrice}");

        Patch.Enable();

        return Task.CompletedTask;
    }
}



