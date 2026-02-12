from datetime import datetime, timedelta
 
def check_temporal_overlap(new_start: datetime, new_end: datetime, existing_tasks: list) -> bool:
    """
    Checks if a time window overlaps with ANY task in the existing schedule.
    Returns True if there is a conflict.
    """
    for task in existing_tasks:
        # Overlap Logic: (StartA < EndB) and (EndA > StartB)
        if (new_start < task.end_time) and (new_end > task.start_time):
            return True
    return False
 
def check_power_constraint(current_battery: float, cost: float, min_battery: float = 20.0) -> bool:
    """
    Checks if the task would drain the battery below the safe limit (e.g., 20%).
    """
    if (current_battery - cost) < min_battery:
        return False # Violation!
    return True