
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import type { Itinerary, Day, Activity } from '../types';
import { ChevronDownIcon, GripVerticalIcon, TrashIcon, EditIcon, LinkIcon } from './icons';
import { categoryIcons, getCategoryIcon } from './constants';

interface ItinerarySectionProps {
    itinerary: Itinerary;
    setItinerary: React.Dispatch<React.SetStateAction<Itinerary | null>>;
}

const ItinerarySection: React.FC<ItinerarySectionProps> = ({ itinerary, setItinerary }) => {
    const [collapsedDays, setCollapsedDays] = useState<{ [key: number]: boolean }>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    
    // Explicit state for the computed End Time string to ensure controlled input behavior
    const [tempEndTime, setTempEndTime] = useState<string>("");

    // State for editing day headers
    const [editingDayId, setEditingDayId] = useState<number | null>(null);
    const [editingDayTheme, setEditingDayTheme] = useState<string>("");

    useEffect(() => {
        const handlePdfStart = () => setCollapsedDays({});
        const handlePdfEnd = () => setCollapsedDays({});

        document.addEventListener('generatePdfStart', handlePdfStart);
        document.addEventListener('generatePdfEnd', handlePdfEnd);

        return () => {
            document.removeEventListener('generatePdfStart', handlePdfStart);
            document.removeEventListener('generatePdfEnd', handlePdfEnd);
        };
    }, []);

    const handleOnDragEnd = (result: DropResult) => {
        if (!result.destination || !itinerary) return;
        const { source, destination } = result;
        const newItinerary = JSON.parse(JSON.stringify(itinerary));
        const sourceDayIndex = newItinerary.findIndex((d: Day) => `day-${d.day}` === source.droppableId);
        const destDayIndex = newItinerary.findIndex((d: Day) => `day-${d.day}` === destination.droppableId);
        if (sourceDayIndex === -1 || destDayIndex === -1) return;
        const sourceDay = newItinerary[sourceDayIndex];
        const destDay = newItinerary[destDayIndex];
        const [removedActivity] = sourceDay.activities.splice(source.index, 1);
        destDay.activities.splice(destination.index, 0, removedActivity);
        setItinerary(newItinerary);
    };

    const handleDeleteActivity = (dayIndex: number, activityId: string) => {
        if (!itinerary) return;
        const newItinerary = JSON.parse(JSON.stringify(itinerary));
        newItinerary[dayIndex].activities = newItinerary[dayIndex].activities.filter(
            (act: Activity) => act.id !== activityId
        );
        setItinerary(newItinerary);
    };

    const handleAddActivity = (dayIndex: number) => {
        if (!itinerary) return;
        const newActivity: Activity = {
            id: `activity-new-${Date.now()}`, time: "12:00", duration: 1, description: "New awesome activity",
            category: "Custom", notes: "", link: "", photo: null
        };
        const newItinerary = JSON.parse(JSON.stringify(itinerary));
        newItinerary[dayIndex].activities.push(newActivity);
        setItinerary(newItinerary);
        handleStartEditing(newActivity);
    };
    
    const handleAddDay = () => {
        if (!itinerary || itinerary.length === 0) return;
        const lastDay = itinerary[itinerary.length - 1];
        const lastDate = new Date(lastDay.date);
        lastDate.setDate(lastDate.getDate() + 1);
        const newDateString = lastDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const newDay: Day = { day: lastDay.day + 1, date: newDateString, theme: "Another Awesome Day", activities: [] };
        setItinerary([...itinerary, newDay]);
    };

    // Helper: Parse time string to minutes from midnight
    const parseTimeToMinutes = (timeStr: string): { minutes: number; is12Hour: boolean; hasAmPm: boolean } | null => {
        if (!timeStr) return null;
        const cleaned = timeStr.trim().toLowerCase();
        
        // Strategy 1: HH:MM or HH.MM or HH,MM (Standard)
        // Regex: 1=Hours, 2=Minutes, 3=AM/PM
        let match = cleaned.match(/^(\d{1,2})[:.,](\d{2})(?:\s*([ap]\.?m\.?))?$/);
        
        // Strategy 2: Lazy integers (e.g. "2pm", "14", "5") -> Treat as HH:00
        if (!match) {
             const lazyMatch = cleaned.match(/^(\d{1,2})(?:\s*([ap]\.?m\.?))?$/);
             if (lazyMatch) {
                 // Mock the standard match structure: [full, hours, minutes, ampm]
                 match = [lazyMatch[0], lazyMatch[1], "00", lazyMatch[2]];
             }
        }

        if (!match) return null;

        let hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const periodRaw = match[3]; // 'am', 'a.m.', 'pm', etc.

        if (mins < 0 || mins > 59) return null;

        let totalMinutes = 0;
        let is12Hour = false;
        let hasAmPm = false;

        if (periodRaw) {
            is12Hour = true;
            hasAmPm = true;
            const isPm = periodRaw.startsWith('p');
            
            if (hours < 1 || hours > 12) return null; // 12h clock limits
            
            if (isPm && hours !== 12) hours += 12;
            if (!isPm && hours === 12) hours = 0;
            
            totalMinutes = hours * 60 + mins;
        } else {
            // 24-hour format logic
            if (hours < 0 || hours > 23) return null;
            totalMinutes = hours * 60 + mins;
        }

        return { minutes: totalMinutes, is12Hour, hasAmPm };
    };

    // Helper: Format minutes back to string based on preference
    const formatMinutesToTime = (totalMinutes: number, use12Hour: boolean): string => {
        // Normalize to 0-1439
        let normalized = totalMinutes % (24 * 60);
        if (normalized < 0) normalized += 24 * 60;

        let h = Math.floor(normalized / 60);
        const m = normalized % 60;
        const mStr = String(m).padStart(2, '0');

        if (use12Hour) {
            const period = h >= 12 ? 'PM' : 'AM';
            h = h % 12;
            if (h === 0) h = 12;
            return `${h}:${mStr} ${period}`;
        } else {
            const hStr = String(h).padStart(2, '0');
            return `${hStr}:${mStr}`;
        }
    };

    // Time Calculation Helper for Display
    const calculateEndTime = (timeStr: string, durationHours: number = 0) => {
        const parsed = parseTimeToMinutes(timeStr);
        if (!parsed) return null;

        const totalStartMinutes = parsed.minutes;
        const durationMinutes = Math.round(durationHours * 60);
        const totalEndMinutes = totalStartMinutes + durationMinutes;
        
        const endDayOffset = Math.floor(totalEndMinutes / (24 * 60));
        
        // Format the end time string using the same format (12h/24h) as input
        const endTimeString = formatMinutesToTime(totalEndMinutes, parsed.hasAmPm);
        
        return { endTimeString, endDayOffset };
    };

    const handleStartEditing = (activity: Activity) => {
        setEditingId(activity.id);
        setEditingActivity({ ...activity });
        // Initialize tempEndTime based on current values
        const calc = calculateEndTime(activity.time, activity.duration);
        setTempEndTime(calc ? calc.endTimeString : "");
    };

    const handleSaveEdit = (dayIndex: number) => {
        if (!itinerary || !editingActivity) return;
        const newItinerary = JSON.parse(JSON.stringify(itinerary));
        const day = newItinerary[dayIndex];
        const activityIndex = day.activities.findIndex((act: Activity) => act.id === editingActivity.id);
        if (activityIndex !== -1) {
            day.activities[activityIndex] = editingActivity;
        }
        setItinerary(newItinerary);
        setEditingId(null);
        setEditingActivity(null);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditingActivity(null);
    };
    
    const handleEditorChange = (field: keyof Activity, value: string | number | null) => {
        if (editingActivity) {
            const updatedActivity = { ...editingActivity, [field]: value };
            setEditingActivity(updatedActivity);
            
            // If we change Time or Duration programmatically (though duration is readonly usually),
            // update the tempEndTime display
            if (field === 'time' || field === 'duration') {
                const newTime = field === 'time' ? value as string : editingActivity.time;
                const newDuration = field === 'duration' ? value as number : editingActivity.duration;
                
                const calc = calculateEndTime(newTime, newDuration);
                if (calc) {
                    setTempEndTime(calc.endTimeString);
                }
            }
        }
    };

    // Special handler for End Time input to calculate duration AND format input
    const handleEndTimeInput = () => {
        if (!editingActivity || !tempEndTime) return;
        
        const startParsed = parseTimeToMinutes(editingActivity.time);
        const endParsed = parseTimeToMinutes(tempEndTime);

        if (!startParsed || !endParsed) {
            // Invalid formats, cannot calculate duration
            return;
        }

        let diffMins = endParsed.minutes - startParsed.minutes;
        
        // Handle overnight wrapping
        if (diffMins < 0) {
            diffMins += 24 * 60;
        }

        const newDuration = diffMins / 60;
        
        // Update the activity state directly
        const updatedActivity = { ...editingActivity, duration: newDuration };
        setEditingActivity(updatedActivity);

        // CRITICAL: Update the Input View to match the parsed reality immediately (Auto-Formatting)
        // This confirms to the user that "2pm" was understood as "2:00 PM"
        const recalc = calculateEndTime(updatedActivity.time, newDuration);
        if (recalc) setTempEndTime(recalc.endTimeString);
    };
    
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                handleEditorChange('photo', reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const toggleDayCollapse = (day: number) => setCollapsedDays(prev => ({ ...prev, [day]: !prev[day] }));
    
    const toggleAllDays = () => {
        const isAnyCollapsed = Object.values(collapsedDays).some(Boolean);
        const newCollapsedState = itinerary.reduce((acc, day) => {
            acc[day.day] = !isAnyCollapsed;
            return acc;
        }, {} as {[key: number]: boolean});
        setCollapsedDays(newCollapsedState);
    };

    // Day Header Editing Logic
    const handleStartEditingDay = (day: Day, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingDayId(day.day);
        setEditingDayTheme(day.theme);
    };

    const handleSaveDayTheme = (dayIndex: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!itinerary) return;
        const newItinerary = JSON.parse(JSON.stringify(itinerary));
        newItinerary[dayIndex].theme = editingDayTheme;
        setItinerary(newItinerary);
        setEditingDayId(null);
        setEditingDayTheme("");
    };

    const handleCancelDayEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingDayId(null);
        setEditingDayTheme("");
    };

    // Style Helpers
    const getCategoryColorClass = (category: string) => {
        const cat = category.toLowerCase();
        if (cat.includes('food')) return 'text-orange-500 bg-orange-500 border-orange-500 shadow-orange-500/50';
        if (cat.includes('sight')) return 'text-emerald-500 bg-emerald-500 border-emerald-500 shadow-emerald-500/50';
        if (cat.includes('culture')) return 'text-rose-500 bg-rose-500 border-rose-500 shadow-rose-500/50';
        if (cat.includes('activity')) return 'text-blue-500 bg-blue-500 border-blue-500 shadow-blue-500/50';
        if (cat.includes('shop')) return 'text-pink-500 bg-pink-500 border-pink-500 shadow-pink-500/50';
        if (cat.includes('night')) return 'text-purple-500 bg-purple-500 border-purple-500 shadow-purple-500/50';
        if (cat.includes('travel')) return 'text-cyan-500 bg-cyan-500 border-cyan-500 shadow-cyan-500/50';
        if (cat.includes('relax')) return 'text-teal-500 bg-teal-500 border-teal-500 shadow-teal-500/50';
        return 'text-slate-500 bg-slate-500 border-slate-500 shadow-slate-500/50';
    };

    return (
        <DragDropContext onDragEnd={handleOnDragEnd}>
            <section id="itinerary-content" className="space-y-6 animate-fade-in">
                <div id="itinerary-title" className="flex justify-between items-center mb-2">
                    <h2 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Your Itinerary</h2>
                    <div className="flex items-center gap-2 printable-hide">
                        <button onClick={toggleAllDays} className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                            {Object.values(collapsedDays).some(Boolean) ? "Expand All" : "Collapse All"}
                        </button>
                    </div>
                </div>
                {itinerary.map((day, dayIndex) => (
                    <div key={day.day} className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden printable-day-container">
                        <div className="day-header p-5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center cursor-pointer group" onClick={() => toggleDayCollapse(day.day)}>
                            <div className="flex-grow">
                                {editingDayId === day.day ? (
                                    <div className="flex items-center gap-2 mr-4" onClick={e => e.stopPropagation()}>
                                        <span className="text-xl font-bold text-indigo-700 dark:text-indigo-400 whitespace-nowrap">Day {day.day}:</span>
                                        <input 
                                            type="text" 
                                            value={editingDayTheme}
                                            onChange={(e) => setEditingDayTheme(e.target.value)}
                                            className="flex-grow px-2 py-1 text-lg font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 border border-indigo-300 dark:border-indigo-500 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveDayTheme(dayIndex, e as any);
                                                if (e.key === 'Escape') handleCancelDayEdit(e as any);
                                            }}
                                        />
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={(e) => handleSaveDayTheme(dayIndex, e)}
                                                className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs font-bold hover:bg-green-200 dark:hover:bg-green-800"
                                            >
                                                SAVE
                                            </button>
                                            <button 
                                                onClick={(e) => handleCancelDayEdit(e)}
                                                className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-2 py-1 rounded text-xs font-bold hover:bg-red-200 dark:hover:bg-red-800"
                                            >
                                                CANCEL
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-xl font-bold text-indigo-700 dark:text-indigo-400">Day {day.day}: <span className="text-slate-800 dark:text-slate-100">{day.theme}</span></h3>
                                        <button 
                                            onClick={(e) => handleStartEditingDay(day, e)}
                                            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1 rounded printable-hide"
                                            title="Edit Day Theme"
                                        >
                                            <EditIcon />
                                        </button>
                                    </div>
                                )}
                                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{day.date}</p>
                            </div>
                            <div className={`transition-transform duration-300 ${collapsedDays[day.day] ? '' : 'rotate-180'} ml-4 flex-shrink-0`}><ChevronDownIcon /></div>
                        </div>
                        {!collapsedDays[day.day] && (
                            <>
                                <Droppable droppableId={`day-${day.day}`}>
                                    {(provided) => (
                                        <ul {...provided.droppableProps} ref={provided.innerRef} className="pb-4 pt-2">
                                            {day.activities.map((activity, index) => {
                                                const timeCalculation = calculateEndTime(activity.time, activity.duration);
                                                const isMultiDay = timeCalculation && timeCalculation.endDayOffset > 0;
                                                const durationHours = activity.duration || 0;
                                                const colorClass = getCategoryColorClass(activity.category);
                                                
                                                return (
                                                <Draggable key={activity.id} draggableId={activity.id} index={index}>
                                                    {(provided, snapshot) => (
                                                        <li 
                                                            ref={provided.innerRef} 
                                                            {...provided.draggableProps} 
                                                            className={`relative group ${snapshot.isDragging ? 'z-50' : ''}`}
                                                        >
                                                             {/* Vertical Timeline Line */}
                                                            <div className="absolute left-[86px] top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700 group-last:h-8 -z-10" />

                                                            <div className={`flex gap-4 items-start px-4 py-2 transition-all ${snapshot.isDragging ? 'opacity-50' : ''}`}>
                                                                {/* Time Column */}
                                                                <div className="w-16 flex-shrink-0 text-right pt-3">
                                                                    <div className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-none">{activity.time}</div>
                                                                    {timeCalculation && (
                                                                         <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                                                            {timeCalculation.endTimeString}
                                                                         </div>
                                                                    )}
                                                                </div>

                                                                {/* Timeline Dot Column */}
                                                                <div className="pt-3.5 relative flex flex-col items-center">
                                                                    <div className={`w-3.5 h-3.5 rounded-full ring-4 ring-white dark:ring-slate-900 z-10 ${colorClass.split(' ').find(c => c.startsWith('bg-'))} ${colorClass.split(' ').find(c => c.startsWith('shadow-'))} shadow-[0_0_10px_currentColor]`} />
                                                                </div>

                                                                {/* Content Column */}
                                                                <div className="flex-grow min-w-0">
                                                                    {editingId === activity.id && editingActivity ? (
                                                                        <div className="bg-indigo-50 dark:bg-slate-800 rounded-xl shadow-lg p-5 border-l-4 border-indigo-500">
                                                                            {/* EDIT FORM */}
                                                                             <div className="space-y-4">
                                                                                <div className="grid grid-cols-2 gap-4">
                                                                                    <div>
                                                                                        <label className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">Start Time</label>
                                                                                        <input 
                                                                                            type="text" 
                                                                                            value={editingActivity.time} 
                                                                                            onChange={(e) => handleEditorChange('time', e.target.value)} 
                                                                                            placeholder="HH:MM or HH:MM AM/PM" 
                                                                                            className="w-full font-bold text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 border border-indigo-300 dark:border-indigo-500 rounded-md p-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500" 
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">End Time</label>
                                                                                        <input 
                                                                                            type="text" 
                                                                                            placeholder="HH:MM or HH:MM AM/PM"
                                                                                            value={tempEndTime}
                                                                                            onChange={(e) => setTempEndTime(e.target.value)}
                                                                                            onBlur={handleEndTimeInput}
                                                                                            className="w-full font-bold text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 border border-indigo-300 dark:border-indigo-500 rounded-md p-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500" 
                                                                                        />
                                                                                        <div className="text-[10px] text-right text-slate-400 mt-1">
                                                                                            Duration: {editingActivity.duration?.toFixed(2)}h
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                
                                                                                <textarea value={editingActivity.description} onChange={(e) => handleEditorChange('description', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-200 border border-indigo-300 dark:border-indigo-500 rounded-md p-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500" rows={2} placeholder="Description" />
                                                                                <textarea value={editingActivity.notes} onChange={e => handleEditorChange('notes', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-200 border border-indigo-300 dark:border-indigo-500 rounded-md p-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500" rows={3} placeholder="Notes" />
                                                                                <input type="url" value={editingActivity.link} onChange={e => handleEditorChange('link', e.target.value)} className="w-full text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-200 border border-indigo-300 dark:border-indigo-500 rounded-md p-2 shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Link" />
                                                                                <div>
                                                                                    <label htmlFor={`photo-upload-${activity.id}`} className="text-xs text-slate-500 dark:text-slate-400 font-medium">Upload Photo</label>
                                                                                    <input type="file" id={`photo-upload-${activity.id}`} accept="image/*" onChange={handlePhotoChange} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/50 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900" />
                                                                                    {editingActivity.photo && <div className="mt-2 relative w-32"><img src={editingActivity.photo} alt="Preview" className="rounded-lg shadow-md w-full h-auto" /><button onClick={() => handleEditorChange('photo', null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center text-xs font-bold shadow-lg">X</button></div>}
                                                                                </div>
                                                                                <div className="mt-3">
                                                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">Category:</p>
                                                                                    <div className="flex flex-wrap gap-2">
                                                                                        {Object.keys(categoryIcons).filter(c => c !== 'Default').map(categoryKey => (<button key={categoryKey} type="button" onClick={() => handleEditorChange('category', categoryKey)} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${editingActivity.category === categoryKey ? 'bg-indigo-100 dark:bg-indigo-500/20 border-indigo-300 dark:border-indigo-500/40 text-indigo-800 dark:text-indigo-300 font-semibold' : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'}`}>{categoryIcons[categoryKey]} {categoryKey}</button>))}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex justify-end gap-2 mt-4">
                                                                                    <button onClick={handleCancelEdit} className="bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-sm py-2 px-4 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500">Cancel</button>
                                                                                    <button onClick={() => handleSaveEdit(dayIndex)} className="bg-indigo-600 text-white font-semibold text-sm py-2 px-4 rounded-md hover:bg-indigo-700">Save</button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className={`
                                                                            relative bg-white dark:bg-slate-800 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 
                                                                            border-l-[6px] p-4 group/card
                                                                            ${colorClass.split(' ').find(c => c.startsWith('border-'))}
                                                                            ${isMultiDay ? 'bg-amber-50 dark:bg-amber-900/10' : ''}
                                                                        `}>
                                                                            {isMultiDay && (
                                                                                <div className="absolute top-0 right-0 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-lg">
                                                                                    +{timeCalculation.endDayOffset} DAY{timeCalculation.endDayOffset > 1 ? 'S' : ''}
                                                                                </div>
                                                                            )}
                                                                            
                                                                            {/* Drag Handle - Absolutely positioned to not mess up layout */}
                                                                            <div {...provided.dragHandleProps} className="absolute top-2 right-2 text-slate-300 hover:text-slate-500 cursor-grab printable-hide opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                                                <GripVerticalIcon />
                                                                            </div>

                                                                            <div className="flex justify-between items-start">
                                                                                 <div>
                                                                                    <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">
                                                                                        {activity.description}
                                                                                    </h4>
                                                                                    <div className="flex items-center gap-2 mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                                                        {getCategoryIcon(activity.category)} 
                                                                                        <span className={colorClass.split(' ').find(c => c.startsWith('text-'))}>{activity.category}</span>
                                                                                        {durationHours > 0 && <span>• {durationHours}h</span>}
                                                                                    </div>
                                                                                 </div>
                                                                            </div>

                                                                            {(activity.notes || activity.link || activity.photo) && (
                                                                                <div className="mt-3 space-y-2">
                                                                                    {activity.photo && <img src={activity.photo} alt={activity.description} className="rounded-lg shadow-sm w-full max-w-sm object-cover max-h-48" />}
                                                                                    {activity.notes && <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 p-2.5 rounded-lg whitespace-pre-wrap">{activity.notes}</p>}
                                                                                    {activity.link && <a href={activity.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline"><LinkIcon /> Link</a>}
                                                                                </div>
                                                                            )}

                                                                            {/* Actions */}
                                                                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2 printable-hide opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                                                <button onClick={() => handleStartEditing(activity)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                                                                                    <EditIcon /> Edit
                                                                                </button>
                                                                                <button onClick={() => handleDeleteActivity(dayIndex, activity.id)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                                                                                    <TrashIcon /> Delete
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </li>
                                                    )}
                                                </Draggable>
                                                );
                                            })}
                                            {provided.placeholder}
                                        </ul>
                                    )}
                                </Droppable>
                                <div className="p-4 bg-slate-50/75 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 text-center printable-hide">
                                    <button onClick={() => handleAddActivity(dayIndex)} className="w-full text-indigo-600 dark:text-indigo-400 font-semibold text-sm py-2 px-4 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                                        + Add Activity
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
                <div className="mt-8 text-center printable-hide">
                    <button onClick={handleAddDay} className="bg-indigo-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:bg-indigo-700 dark:hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">
                        + Add New Day
                    </button>
                </div>
            </section>
        </DragDropContext>
    );
};

export default ItinerarySection;
