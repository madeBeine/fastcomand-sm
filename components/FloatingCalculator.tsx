
import React, { useState, useEffect, useRef } from 'react';
import { Calculator } from 'lucide-react';
import QuickCalculator from './QuickCalculator';
import type { Currency, AppSettings } from '../types';

interface FloatingCalculatorProps {
    currencies: Currency[];
    settings: AppSettings;
}

const FloatingCalculator: React.FC<FloatingCalculatorProps> = ({ currencies, settings }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ x: 20, y: window.innerHeight - 80 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const initialPosRef = useRef<{ x: number, y: number } | null>(null);

    // Load saved position
    useEffect(() => {
        const savedPos = localStorage.getItem('calcPosition');
        if (savedPos) {
            try {
                const parsed = JSON.parse(savedPos);
                setPosition(parsed);
            } catch {}
        } else {
            // Default bottom-left
            setPosition({ x: 20, y: window.innerHeight - 80 });
        }
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('.calc-content')) return; // Allow interaction with content
        
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        initialPosRef.current = { ...position };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !dragStartRef.current || !initialPosRef.current) return;
        
        e.preventDefault();
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        setPosition({
            x: initialPosRef.current.x + deltaX,
            y: initialPosRef.current.y + deltaY
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging) return;
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        
        // Snap to bounds slightly
        let newX = position.x;
        let newY = position.y;
        
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;

        if (newX < 10) newX = 10;
        if (newX > maxX) newX = maxX;
        if (newY < 10) newY = 10;
        if (newY > maxY) newY = maxY;

        setPosition({ x: newX, y: newY });
        localStorage.setItem('calcPosition', JSON.stringify({ x: newX, y: newY }));
    };

    return (
        <>
            {/* Draggable Floating Button */}
            <div 
                style={{ 
                    left: `${position.x}px`, 
                    top: `${position.y}px`,
                    touchAction: 'none'
                }}
                className="fixed z-[90] cursor-move select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                <button 
                    onClick={() => {
                        // Only toggle if not dragged significantly
                        if (!isDragging) setIsOpen(true);
                    }}
                    className={`bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-2xl border-2 border-white dark:border-slate-800 transition-transform active:scale-95 flex items-center justify-center ${isDragging ? 'scale-110 shadow-xl' : 'hover:scale-110'}`}
                    title="الحاسبة السريعة (اسحب للتحريك)"
                >
                    <Calculator size={20} />
                </button>
            </div>

            {/* Overlay Modal */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200 calc-content"
                    onClick={() => setIsOpen(false)}
                >
                    <div onClick={e => e.stopPropagation()}>
                        <QuickCalculator 
                            currencies={currencies} 
                            settings={settings} 
                            isFloating={true}
                            onClose={() => setIsOpen(false)}
                        />
                    </div>
                </div>
            )}
        </>
    );
};

export default FloatingCalculator;
