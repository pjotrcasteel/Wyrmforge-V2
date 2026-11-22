namespace Wyrmforge.V2.Domain;

/// <summary>Hunt lifecycle names reserved for the new game, not a completed state machine.</summary>
public enum HuntPhase
{
    Preparation,
    Expedition,
    Encounter,
    WyrmBattle,
    Extraction,
    Completed,
    Defeated,
    Abandoned
}
