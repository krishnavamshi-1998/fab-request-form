'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface DropdownItem {
  name: string;
  stock: string | number;
}

interface FormItem {
  type: 'Tools' | 'Machine';
  itemName: string;
  quantity: string; 
}

export default function RequestForm() {
  const { data: session, status } = useSession();

  // Form states matching dynamic backend requirements
  const [formData, setFormData] = useState({
    supervisor: '',
    supervisorEmail: '',
    location: '',
    issuedTo: '',
    expectedReturn: '',
  });

  const [department, setDepartment] = useState<'Fabrication' | 'Other'>('Fabrication');
  const [items, setItems] = useState<FormItem[]>([
    { type: 'Tools', itemName: '', quantity: '' }
  ]);

  const [tools, setTools] = useState<DropdownItem[]>([]);
  const [machines, setMachines] = useState<DropdownItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: '', isError: false });

  const [itemOpen, setItemOpen] = useState<{ [key: number]: boolean }>({});
  const [itemSearch, setItemSearch] = useState<{ [key: number]: string }>({});
  const itemsRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // 1. Automatically sync session details into hidden tracker state values
  useEffect(() => {
    if (session?.user) {
      setFormData(prev => ({
        ...prev,
        supervisorEmail: session.user.email || '',
        supervisor: session.user.name || 'Authenticated Supervisor'
      }));
    }
  }, [session]);

  // Sync Department selections straight into the unified issuedTo field string
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      issuedTo: department === 'Fabrication' ? 'Fabrication Dept' : ''
    }));
  }, [department]);

  // 2. Fetch Dropdowns & Listen for Outside Click Closures
  useEffect(() => {
    async function fetchDropdownData() {
      try {
        const res = await fetch('/api/dropdowns');
        const json = await res.json();
        
        if (json.success) {
          const formattedTools = (json.tools || []).map((t: any) => 
            typeof t === 'string' ? { name: t, stock: 'Live' } : { name: t.name || '', stock: t.stock ?? 'Live' }
          );
          const formattedMachines = (json.machines || []).map((m: any) => 
            typeof m === 'string' ? { name: m, stock: 'Live' } : { name: m.name || '', stock: m.stock ?? 'Live' }
          );

          setTools(formattedTools);
          setMachines(formattedMachines);
        }
      } catch (err) {
        console.error('Failed to load form dropdowns:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchDropdownData();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (target.closest('.qty-container-block')) {
        return;
      }

      setItemOpen(prev => {
        const updated = { ...prev };
        let changed = false;

        Object.keys(itemsRefs.current).forEach((key) => {
          const index = Number(key);
          const rowRef = itemsRefs.current[index];
          
          if (updated[index] && rowRef && !rowRef.contains(target)) {
            updated[index] = false;
            changed = true;
          }
        });

        return changed ? updated : prev;
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setItemOpen({});
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 3. Dynamic row manipulation functions
  const handleAddItemRow = () => {
    setItems([...items, { type: 'Tools', itemName: '', quantity: '' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
      const updatedSearch = { ...itemSearch };
      const updatedOpen = { ...itemOpen };
      delete updatedSearch[index];
      delete updatedOpen[index];
      setItemSearch(updatedSearch);
      setItemOpen(updatedOpen);
      delete itemsRefs.current[index];
    }
  };

  const updateItemField = (index: number, field: keyof FormItem, value: any) => {
    const updated = [...items];
    if (field === 'type') {
      updated[index] = { ...updated[index], type: value, itemName: '' };
      setItemSearch({ ...itemSearch, [index]: '' });
    } else if (field === 'quantity') {
      const cleanValue = value.replace(/[^0-9]/g, '');
      updated[index].quantity = cleanValue;
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setItems(updated);
  };

  const handleStepQuantity = (index: number, direction: 'up' | 'down') => {
    const currentNum = parseInt(items[index].quantity, 10) || 0;
    if (direction === 'up') {
      updateItemField(index, 'quantity', String(currentNum + 1));
    } else {
      updateItemField(index, 'quantity', String(Math.max(1, currentNum - 1)));
    }
  };

  // 4. API Transmission Handle Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasInvalidQuantity = items.some(i => !i.quantity || parseInt(String(i.quantity), 10) <= 0);

    if (!formData.supervisor || items.some(i => !i.itemName)) {
      setMessage({ text: 'Session validation error. Please check your login details and fill out item rows.', isError: true });
      return;
    }

    if (hasInvalidQuantity) {
      setMessage({ text: 'Please enter a valid quantity greater than 0 for all items.', isError: true });
      return;
    }

    setSubmitting(true);
    setMessage({ text: '', isError: false });

    const formattedItems = items.map(item => ({
      ...item,
      quantity: parseInt(String(item.quantity), 10)
    }));

    try {
      const payload = {
        supervisor: formData.supervisor,
        supervisorEmail: formData.supervisorEmail,
        location: formData.location,
        expectedReturn: formData.expectedReturn,
        issuedTo: formData.issuedTo,
        items: formattedItems
      };

      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({ text: 'Request logged into Spreadsheet successfully!', isError: false });
        setItems([{ type: 'Tools', itemName: '', quantity: '' }]);
        setItemSearch({});
        setFormData(prev => ({ ...prev, location: '', expectedReturn: '' }));
      } else {
        setMessage({ text: `Submission Failed: ${result.error}`, isError: true });
      }
    } catch (err: any) {
      console.error("Form Submission Network Error:", err);
      setMessage({ text: 'Internal transmission failure. Please try again.', isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Auth Processing Loader Gate
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center p-10 font-medium text-gray-600">Verifying login credentials...</div>
      </div>
    );
  }

  // 6. Security Authentication Gate (Forces users to log in before viewing form content)
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Fabrication Tracker Portal</h2>
          <p className="text-sm text-gray-600 mb-6">Please authenticate using your account email to request tool and machine allocations.</p>
          <button
            type="button"
            onClick={() => signIn('google')}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md font-semibold hover:bg-blue-700 transition duration-150 shadow-sm"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  // 7. Full Main Render Tree (Only accessible when signed in)
  return (
    <main className="min-h-screen bg-gray-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6 sm:p-8">
        
        {/* Active Session Account Topbar */}
        <div className="flex justify-between items-center mb-6 bg-blue-50 p-3.5 rounded border border-blue-100 shadow-sm">
          <div>
            <p className="text-xs text-blue-600 uppercase tracking-wider font-bold">Active Supervisor</p>
            <p className="text-sm text-gray-700"><strong>{session.user?.name}</strong> ({session.user?.email})</p>
          </div>
          <button 
            type="button" 
            onClick={() => signOut()} 
            className="text-xs font-semibold bg-white text-red-500 hover:text-red-700 px-3 py-1.5 border border-red-200 rounded shadow-sm transition"
          >
            Sign Out
          </button>
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center border-b pb-4">
          Fabrication Tracker Request Form
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            
            {/* LOCATION / SITE FIELD */}
            <div className="flex flex-col space-y-1 col-span-1 sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">Location / Site</label>
              <input
                type="text"
                required
                placeholder="Enter deployment site location"
                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>

            {/* ISSUED TO FIELD DEPARTMENT TOGGLE SWITCH */}
            <div className="flex flex-col col-span-1 sm:col-span-2 bg-gray-50 p-4 rounded-md border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Issued To</label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setDepartment('Fabrication')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all duration-150 ${
                    department === 'Fabrication' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Fabrication Dept
                </button>
                <button
                  type="button"
                  onClick={() => setDepartment('Other')}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-semibold transition-all duration-150 ${
                    department === 'Other' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                  }`}
                >
                  Other Depts
                </button>
              </div>

              {/* Conditional custom department input string */}
              {department === 'Other' && (
                <input
                  type="text"
                  required
                  placeholder="Type target department or employee name..."
                  className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  value={formData.issuedTo}
                  onChange={(e) => setFormData({ ...formData, issuedTo: e.target.value })}
                />
              )}
            </div>

            {/* EXPECTED RETURN DATE */}
            <div className="flex flex-col space-y-1 col-span-1 sm:col-span-2">
              <label className="text-sm font-medium text-gray-700">Expected Return Date</label>
              <input
                type="date"
                required
                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                value={formData.expectedReturn}
                onChange={(e) => setFormData({ ...formData, expectedReturn: e.target.value })}
              />
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Section: Dynamic Item Allocator Row Loop */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Requested Items Checklist</h2>
            
            {loading ? (
              <div className="text-center text-sm text-gray-500 p-4">Loading active equipment inventory dropdown lists...</div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => {
                  const masterList = item.type === 'Tools' ? tools : machines;
                  const currentSearch = itemSearch[index] || '';
                  const isOpen = itemOpen[index] || false;
                  
                  const filteredItems = masterList.filter(availItem =>
                    availItem.name.toLowerCase().includes(currentSearch.toLowerCase())
                  );
                  
                  return (
                    <div key={index} className="flex flex-col sm:flex-row gap-4 items-end bg-gray-50 p-4 rounded-md border border-gray-200 relative">
                      
                      {/* Dropdown Category Selector */}
                      <div className="w-full sm:w-1/4 flex flex-col space-y-1">
                        <label className="text-xs font-medium text-gray-600">Category</label>
                        <select
                          className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                          value={item.type}
                          onChange={(e) => updateItemField(index, 'type', e.target.value as any)}
                        >
                          <option value="Tools">Tools</option>
                          <option value="Machine">Machine</option>
                        </select>
                      </div>

                      {/* Searchable Input Dropdown Container */}
                      <div 
                        className="w-full sm:w-2/4 flex flex-col space-y-1 relative"
                        ref={(el) => { itemsRefs.current[index] = el; }}
                      >
                        <label className="text-xs font-medium text-gray-600">Item Selection</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            placeholder={`🔍 Search standard ${item.type.toLowerCase()}...`}
                            className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                            value={currentSearch}
                            onFocus={() => setItemOpen({ ...itemOpen, [index]: true })}
                            onChange={(e) => {
                              setItemSearch({ ...itemSearch, [index]: e.target.value });
                              setItemOpen({ ...itemOpen, [index]: true });
                              if (item.itemName) updateItemField(index, 'itemName', '');
                            }}
                          />
                          {isOpen && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md max-h-60 overflow-y-auto shadow-lg">
                              {filteredItems.length === 0 ? (
                                <div className="p-2 text-sm text-gray-500">No matching items inventory found</div>
                              ) : (
                                <div className="divide-y divide-gray-100">
                                  {filteredItems.map((availItem, i) => (
                                    <div
                                      key={i}
                                      className="p-2 text-sm hover:bg-blue-500 hover:text-white cursor-pointer transition-colors"
                                      onClick={() => {
                                        updateItemField(index, 'itemName', availItem.name);
                                        setItemSearch({ ...itemSearch, [index]: availItem.name });
                                        setItemOpen({ ...itemOpen, [index]: false });
                                      }}
                                    >
                                      {availItem.name} <span className="text-xs opacity-75">(Stock: {availItem.stock})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Stepper Quantity Container */}
                      <div className="w-full sm:w-1/4 flex flex-col space-y-1">
                        <label className="text-xs font-medium text-gray-600">Quantity</label>
                        <div className="qty-container-block flex items-center bg-white border border-gray-300 rounded-md h-[38px] overflow-hidden shadow-sm focus-within:ring-1 focus-within:ring-blue-500">
                          <button
                            type="button"
                            className="px-3 h-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold border-r border-gray-300 select-none text-base"
                            onClick={() => handleStepQuantity(index, 'down')}
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            className="w-full h-full text-center text-sm font-semibold text-gray-800 outline-none px-2 bg-transparent min-w-[45px]"
                            value={item.quantity}
                            onChange={(e) => updateItemField(index, 'quantity', e.target.value)}
                          />
                          <button
                            type="button"
                            className="px-3 h-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold border-l border-gray-300 select-none text-base"
                            onClick={() => handleStepQuantity(index, 'up')}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Row Actions Delete Button */}
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(index)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium border border-red-200 bg-white rounded-md px-3 py-2 h-[38px] transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handleAddItemRow}
              className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center transition-colors"
            >
              + Add Another Item Line
            </button>
          </div>

          {/* User Feedback Operational Banner notifications */}
          {message.text && (
            <div className={`p-3 rounded-md text-sm font-medium ${message.isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {message.text}
            </div>
          )}

          {/* Final Submit Operation Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-md text-sm transition duration-150 disabled:bg-blue-400 shadow-sm"
          >
            {submitting ? 'Transmitting Data to Logs...' : 'Submit Request Form'}
          </button>
        </form>
      </div>
    </main>
  );
}