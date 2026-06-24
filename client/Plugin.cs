using EFT.UI;
using System.Collections.Generic;
using BepInEx;
using BepInEx.Logging;
using HarmonyLib;
using System.Reflection;


namespace PostRaidResources
{
    
    [BepInPlugin("PostRaidResources.UniqueGUID", "PostRaidResources", "2.0.0")]
    public class Plugin : BaseUnityPlugin
    {
        public static ManualLogSource LogSource;

        private void InjectTreatments()
        {
            FieldInfo treatmentListField = AccessTools.Field(typeof(HealthTreatmentServiceView), "list_0");

            if (treatmentListField == null) {
                Logger.LogError("treatmentListField is null");
                return;
            }

            List<GInterface493> treatmentList = (List<GInterface493>)treatmentListField.GetValue(null);

            if (treatmentList == null)
            {
                Logger.LogError("treatmentList is null");
                return;
            }
            treatmentList.Add(new GClass3849()); // Energy
            treatmentList.Add(new GClass3848()); // Hydration
            
        }
        private void Awake()
        {
            LogSource = Logger;
            LogSource.LogInfo("plugin loaded!");

            try
            {
                InjectTreatments();
            }
            catch(System.Exception e)
            {
                Logger.LogError($"Failed to inject Energy/Hydration into treatment list with error: {e}");
            }
            
        }
    }
    
}
