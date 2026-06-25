"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  FileCheck, 
  Cpu, 
  ShieldCheck, 
  Loader2, 
  RefreshCw, 
  User,
  DollarSign,
  Calendar,
  Anchor,
  Globe,
  Edit2,
  Copy,
  Mail,
  Check,
  Clock,
  HelpCircle,
  Terminal
} from "lucide-react";

interface ExtractedDoc {
  invoice_number: string;
  invoice_number_quote: string;
  invoice_number_confidence: number;
  
  total_amount: number;
  total_amount_quote: string;
  total_amount_confidence: number;
  
  currency: string;
  currency_quote: string;
  currency_confidence: number;
  
  shipment_date: string;
  shipment_date_quote: string;
  shipment_date_confidence: number;
  
  port_of_loading: string;
  port_of_loading_quote: string;
  port_of_loading_confidence: number;
  
  beneficiary_name: string;
  beneficiary_name_quote: string;
  beneficiary_name_confidence: number;

  applicant_name: string;
  applicant_name_quote: string;
  applicant_name_confidence: number;

  port_of_discharge: string;
  port_of_discharge_quote: string;
  port_of_discharge_confidence: number;

  goods_description: string;
  goods_description_quote: string;
  goods_description_confidence: number;

  incoterms: string;
  incoterms_quote: string;
  incoterms_confidence: number;
}

interface Discrepancy {
  field: string;
  actual_value: string;
  expected_value: string;
  reason: string;
  severity: string;
}

interface CheckResult {
  status: string;
  extracted: ExtractedDoc;
  discrepancies: Discrepancy[];
  waiver_draft?: string;
}

interface AuditLog {
  time: string;
  message: string;
  type: "info" | "success" | "warning" | "edit";
}

export default function Home() {
  // Navigation & Screens (BA v2.0 TO-BE Journey)
  const [screen, setScreen] = useState<"login" | "dashboard" | "upload" | "safety_gate" | "result">("login");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [loginError, setLoginError] = useState("");

  // Dashboard Case list state
  const [dashboardCases, setDashboardCases] = useState<any[]>([
    { id: "CASE-001", name: "Bộ hồ sơ xuất khẩu Gạo sang Hamburg", date: "2026-06-24", status: "Compliant", conclusion: "Đã giải ngân" },
    { id: "CASE-002", name: "Bộ hồ sơ Sắt thép từ Haiphong", date: "2026-06-23", status: "Closed", conclusion: "Từ chối thanh toán" }
  ]);

  // L/C Terms Form State
  const [lcTerms, setLcTerms] = useState({
    max_amount: "50000",
    currency: "USD",
    latest_shipment: "2026-06-30",
    beneficiary_name: "GLOBAL TRADING CORP",
    port_of_loading: "HAIPHONG PORT",
    applicant_name: "IMPORT CO LTD",
    expiry_date: "2026-07-15",
    port_of_discharge: "HAMBURG PORT",
    goods_description: "AGRICULTURAL PRODUCTS",
    incoterms: "CIF",
    partial_shipment: "ALLOWED",
    transhipment: "PROHIBITED",
    amount_tolerance: "5/5"
  });

  // SWIFT Parsing Mode State
  const [lcInputMode, setLcInputMode] = useState<"form" | "swift">("form");
  const [swiftText, setSwiftText] = useState("");
  const [isParsingSwift, setIsParsingSwift] = useState(false);

  // L/C File Upload State
  const [lcFile, setLcFile] = useState<File | null>(null);
  const [isLCParsing, setIsLCParsing] = useState(false);
  const [lcConfidences, setLcConfidences] = useState<Record<string, number>>({});

  // Files State
  const [files, setFiles] = useState<File[]>([]);
  
  // Loading & Result States
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extracted Docs for BL, PL, Cross checking and Tab Selection
  const [extractedBl, setExtractedBl] = useState<any | null>(null);
  const [extractedPl, setExtractedPl] = useState<any | null>(null);
  const [layer1Discrepancies, setLayer1Discrepancies] = useState<Discrepancy[]>([]);
  const [crossDiscrepancies, setCrossDiscrepancies] = useState<Discrepancy[]>([]);
  const [cannotWaive, setCannotWaive] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"internal" | "cross" | "lc">("internal");

  // Live Terminal Logs from Backend Streaming
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Editable state (HITL)
  const [extractedDoc, setExtractedDoc] = useState<ExtractedDoc | null>(null);
  const [discrepancyList, setDiscrepancyList] = useState<Discrepancy[]>([]);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Audit Logs (Audit Trail)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Load Audit Logs from Backend on Mount
  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        const response = await axios.get("http://localhost:8000/api/v1/audit-trail");
        setAuditLogs(response.data);
      } catch (err) {
        console.error("Không thể tải Audit Trail từ Backend:", err);
      }
    };
    fetchAuditLogs();
  }, []);

  // Decision States (BA v2.0 TO-BE)
  const [decisionStatus, setDecisionStatus] = useState<"idle" | "payout" | "waiver" | "rejected" | "pending_customer" | "compliant_with_waiver">("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signStatus, setSignStatus] = useState<"connecting" | "signing" | "success" | "idle">("idle");
  const [txHash, setTxHash] = useState("");

  // Copy email status
  const [copied, setCopied] = useState(false);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Add Log to Audit Trail
  const addAuditLog = useCallback((msg: string, type: "info" | "success" | "warning" | "edit") => {
    const timeStr = new Date().toLocaleTimeString();
    setAuditLogs(prev => [{ time: timeStr, message: msg, type }, ...prev]);
    axios.post("http://localhost:8000/api/v1/audit-trail", {
      time: timeStr,
      message: msg,
      type
    }).catch(err => {
      console.error("Không thể lưu Audit Log lên Backend:", err);
    });
  }, []);

  // Recalculate discrepancies on client side for HITL
  const recalculateDiscrepancies = useCallback((updatedExt: ExtractedDoc) => {
    const list: Discrepancy[] = [];
    
    // 1. Total Amount with Tolerance
    const maxAmt = parseFloat(lcTerms.max_amount);
    const amountTolStr = (lcTerms.amount_tolerance || "").trim().toLowerCase();
    let positiveTol = 5.0;
    let negativeTol = 5.0;
    if (amountTolStr === "0" || amountTolStr.includes("exactly")) {
      positiveTol = 0.0;
      negativeTol = 0.0;
    } else if (amountTolStr.includes("/")) {
      const parts = amountTolStr.split("/");
      const p1 = parseFloat(parts[0].replace("%", "").trim());
      const p2 = parseFloat(parts[1].replace("%", "").trim());
      if (!isNaN(p1)) positiveTol = p1;
      if (!isNaN(p2)) negativeTol = p2;
    } else if (amountTolStr) {
      const val = parseFloat(amountTolStr.replace("%", "").trim());
      if (!isNaN(val)) {
        positiveTol = val;
        negativeTol = val;
      }
    }
    
    const maxAllowed = maxAmt * (1 + positiveTol / 100);
    if (!isNaN(maxAmt) && updatedExt.total_amount > maxAllowed) {
      list.push({
        field: "total_amount",
        actual_value: `${updatedExt.total_amount.toLocaleString()} ${updatedExt.currency}`,
        expected_value: `<= ${maxAllowed.toLocaleString()} ${lcTerms.currency} (Hạn mức ${maxAmt.toLocaleString()} + ${positiveTol}% dung sai)`,
        reason: `Tổng số tiền vượt hạn mức L/C cho phép sau khi tính dung sai (Lệch ${(updatedExt.total_amount - maxAllowed).toLocaleString()})`,
        severity: "Error"
      });
    }

    // 2. Currency
    if (updatedExt.currency.trim().toUpperCase() !== lcTerms.currency.trim().toUpperCase()) {
      list.push({
        field: "currency",
        actual_value: updatedExt.currency,
        expected_value: lcTerms.currency,
        reason: "Loại tiền tệ thanh toán không trùng khớp với điều khoản L/C",
        severity: "Error"
      });
    }

    // 3. Shipment Date
    if (updatedExt.shipment_date && lcTerms.latest_shipment) {
      const extDate = new Date(updatedExt.shipment_date);
      const lcDate = new Date(lcTerms.latest_shipment);
      if (extDate > lcDate) {
        list.push({
          field: "shipment_date",
          actual_value: updatedExt.shipment_date,
          expected_value: `Trước hoặc bằng ${lcTerms.latest_shipment}`,
          reason: `Ngày giao hàng thực tế (${updatedExt.shipment_date}) muộn hơn thời hạn giao hàng của L/C (${lcTerms.latest_shipment})`,
          severity: "Error"
        });
      }
    }

    // 4. Expiry Date
    if (updatedExt.shipment_date && lcTerms.expiry_date) {
      const extDate = new Date(updatedExt.shipment_date);
      const expDate = new Date(lcTerms.expiry_date);
      if (extDate > expDate) {
        list.push({
          field: "shipment_date",
          actual_value: updatedExt.shipment_date,
          expected_value: `Trước hoặc bằng Ngày hết hạn ${lcTerms.expiry_date}`,
          reason: `Ngày giao hàng/trình chứng từ (${updatedExt.shipment_date}) muộn hơn Ngày hết hạn của L/C (${lcTerms.expiry_date})`,
          severity: "Error"
        });
      }
    }

    // 5. Beneficiary Name
    if (updatedExt.beneficiary_name.trim().toLowerCase() !== lcTerms.beneficiary_name.trim().toLowerCase()) {
      list.push({
        field: "beneficiary_name",
        actual_value: updatedExt.beneficiary_name,
        expected_value: lcTerms.beneficiary_name,
        reason: "Tên bên thụ hưởng không khớp chuẩn với L/C (Strict Compliance)",
        severity: "Error"
      });
    }

    // 6. Applicant Name
    if (updatedExt.applicant_name && lcTerms.applicant_name) {
      if (updatedExt.applicant_name.trim().toLowerCase() !== lcTerms.applicant_name.trim().toLowerCase()) {
        list.push({
          field: "applicant_name",
          actual_value: updatedExt.applicant_name,
          expected_value: lcTerms.applicant_name,
          reason: "Tên người mua (Applicant) không khớp chuẩn với L/C (UCP 600 Art.18)",
          severity: "Error"
        });
      }
    }

    // 7. Port of Loading
    if (updatedExt.port_of_loading.trim().toLowerCase() !== lcTerms.port_of_loading.trim().toLowerCase()) {
      list.push({
        field: "port_of_loading",
        actual_value: updatedExt.port_of_loading,
        expected_value: lcTerms.port_of_loading,
        reason: "Cảng bốc hàng không trùng khớp với điều khoản L/C",
        severity: "Warning"
      });
    }

    // 8. Port of Discharge
    if (updatedExt.port_of_discharge && lcTerms.port_of_discharge) {
      if (updatedExt.port_of_discharge.trim().toLowerCase() !== lcTerms.port_of_discharge.trim().toLowerCase()) {
        list.push({
          field: "port_of_discharge",
          actual_value: updatedExt.port_of_discharge,
          expected_value: lcTerms.port_of_discharge,
          reason: "Cảng dỡ hàng không trùng khớp với điều khoản L/C",
          severity: "Error"
        });
      }
    }

    // 9. Incoterms
    if (updatedExt.incoterms && lcTerms.incoterms) {
      if (!updatedExt.incoterms.trim().toLowerCase().includes(lcTerms.incoterms.trim().toLowerCase())) {
        list.push({
          field: "incoterms",
          actual_value: updatedExt.incoterms,
          expected_value: lcTerms.incoterms,
          reason: "Điều kiện giao hàng (Incoterms) không trùng khớp với L/C",
          severity: "Error"
        });
      }
    }

    // 10. Goods Description
    if (updatedExt.goods_description && lcTerms.goods_description) {
      const lcGoodsLower = lcTerms.goods_description.trim().toLowerCase();
      const extGoodsLower = updatedExt.goods_description.trim().toLowerCase();
      if (!extGoodsLower.includes(lcGoodsLower)) {
        const lcWords = lcGoodsLower.split(/\s+/).filter(w => w.length > 3);
        const extWords = extGoodsLower.split(/\s+/).filter(w => w.length > 3);
        const hasOverlap = lcWords.some(w => extWords.includes(w));
        if (!hasOverlap) {
          list.push({
            field: "goods_description",
            actual_value: updatedExt.goods_description,
            expected_value: lcTerms.goods_description,
            reason: "Mô tả hàng hóa không trùng khớp hoặc không tương đương với L/C",
            severity: "Error"
          });
        }
      }
    }

    setDiscrepancyList(list);

    // Recalculate Layer 2 Cross Check Discrepancies
    const crossList: Discrepancy[] = [];
    if (extractedBl) {
      // 1. Beneficiary (Invoice) vs Shipper (B/L)
      if (updatedExt.beneficiary_name && extractedBl.shipper_name) {
        const invBen = updatedExt.beneficiary_name.trim().toLowerCase();
        const blShip = extractedBl.shipper_name.trim().toLowerCase();
        if (invBen !== blShip && !invBen.includes(blShip) && !blShip.includes(invBen)) {
          crossList.push({
            field: "cross_beneficiary_shipper",
            actual_value: extractedBl.shipper_name,
            expected_value: updatedExt.beneficiary_name,
            reason: "Tên Shipper trên B/L không khớp với bên thụ hưởng (Beneficiary) trên Hóa đơn",
            severity: "Error"
          });
        }
      }

      // 2. Goods Description (Invoice) vs B/L
      if (updatedExt.goods_description && extractedBl.goods_description) {
        const invGoods = updatedExt.goods_description.trim().toLowerCase();
        const blGoods = extractedBl.goods_description.trim().toLowerCase();
        const getWords = (str: string) => new Set(str.split(/\s+/).filter(w => w.length > 3));
        const invWords = getWords(invGoods);
        const blWords = getWords(blGoods);
        const hasOverlap = Array.from(invWords).some(w => blWords.has(w));
        if (!hasOverlap && !invGoods.includes(blGoods) && !blGoods.includes(invGoods)) {
          crossList.push({
            field: "cross_goods_invoice_bl",
            actual_value: extractedBl.goods_description,
            expected_value: updatedExt.goods_description,
            reason: "Mô tả hàng hóa trên B/L không tương đồng với trên Hóa đơn thương mại",
            severity: "Error"
          });
        }
      }

      // 3. Port of Loading (Invoice) vs B/L
      if (updatedExt.port_of_loading && extractedBl.port_of_loading) {
        if (updatedExt.port_of_loading.trim().toLowerCase() !== extractedBl.port_of_loading.trim().toLowerCase()) {
          crossList.push({
            field: "cross_loading_port",
            actual_value: extractedBl.port_of_loading,
            expected_value: updatedExt.port_of_loading,
            reason: "Cảng bốc hàng trên B/L không khớp với Hóa đơn",
            severity: "Error"
          });
        }
      }

      // 4. Port of Discharge (Invoice) vs B/L
      if (updatedExt.port_of_discharge && extractedBl.port_of_discharge) {
        if (updatedExt.port_of_discharge.trim().toLowerCase() !== extractedBl.port_of_discharge.trim().toLowerCase()) {
          crossList.push({
            field: "cross_discharge_port",
            actual_value: extractedBl.port_of_discharge,
            expected_value: updatedExt.port_of_discharge,
            reason: "Cảng dỡ hàng trên B/L không khớp với Hóa đơn",
            severity: "Error"
          });
        }
      }
    }

    if (extractedPl) {
      // 1. Invoice vs Packing List Goods Description
      if (updatedExt.goods_description && extractedPl.goods_name) {
        const invGoods = updatedExt.goods_description.trim().toLowerCase();
        const plGoods = extractedPl.goods_name.trim().toLowerCase();
        const getWords = (str: string) => new Set(str.split(/\s+/).filter(w => w.length > 3));
        const invWords = getWords(invGoods);
        const plWords = getWords(plGoods);
        const hasOverlap = Array.from(invWords).some(w => plWords.has(w));
        if (!hasOverlap && !invGoods.includes(plGoods) && !plGoods.includes(invGoods)) {
          crossList.push({
            field: "cross_goods_invoice_pl",
            actual_value: extractedPl.goods_name,
            expected_value: updatedExt.goods_description,
            reason: "Mô tả hàng hóa trên Packing List không tương đồng với trên Hóa đơn",
            severity: "Error"
          });
        }
      }
    }

    setCrossDiscrepancies(crossList);
  }, [lcTerms, extractedBl, extractedPl]);

  // Handle Form Input Change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLcTerms(prev => ({ ...prev, [name]: value }));
  };

  // Call API to Parse SWIFT MT700
  const handleParseSwift = async () => {
    if (!swiftText.trim()) {
      alert("Vui lòng dán văn bản điện SWIFT MT700 vào trước.");
      return;
    }

    setIsParsingSwift(true);
    addAuditLog("Bắt đầu gọi AI phân tích điện SWIFT MT700...", "info");
    try {
      const response = await axios.post("http://localhost:8000/api/v1/parse-swift", {
        swift_text: swiftText
      });
      
      if (response.data.status === "success" && response.data.lc_terms) {
        const terms = response.data.lc_terms;
        setLcTerms({
          max_amount: terms.max_amount.toString(),
          currency: terms.currency,
          latest_shipment: terms.latest_shipment,
          beneficiary_name: terms.beneficiary_name,
          port_of_loading: terms.port_of_loading,
          applicant_name: terms.applicant_name || "",
          expiry_date: terms.expiry_date || "",
          port_of_discharge: terms.port_of_discharge || "",
          goods_description: terms.goods_description || "",
          incoterms: terms.incoterms || "",
          partial_shipment: terms.partial_shipment || "",
          transhipment: terms.transhipment || "",
          amount_tolerance: terms.amount_tolerance || ""
        });
        
        // Extract confidences
        const confs: Record<string, number> = {};
        Object.keys(terms).forEach(key => {
          if (key.endsWith("_confidence")) {
            const fieldName = key.replace("_confidence", "");
            confs[fieldName] = terms[key];
          }
        });
        setLcConfidences(confs);
        
        addAuditLog("Giải mã điện SWIFT MT700 và điền tự động tham chiếu L/C thành công! Chuyển sang Safety Gate.", "success");
        setScreen("safety_gate");
      }
    } catch (err: any) {
      console.error(err);
      alert("Không thể giải mã điện SWIFT. Vui lòng kiểm tra lại kết nối backend hoặc key.");
      addAuditLog("Giải mã điện SWIFT thất bại.", "warning");
    } finally {
      setIsParsingSwift(false);
    }
  };

  // Call API to Extract L/C terms from uploaded PDF L/C file
  const handleLcFileUpload = async (file: File) => {
    setLcFile(file);
    setIsLCParsing(true);
    setError(null);
    addAuditLog(`Bắt đầu bóc tách điều khoản từ file L/C PDF: ${file.name}...`, "info");
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await axios.post("http://localhost:8000/api/v1/extract-lc-file", formData);
      if (response.data.status === "success" && response.data.lc_terms) {
        const terms = response.data.lc_terms;
        setLcTerms({
          max_amount: terms.max_amount.toString(),
          currency: terms.currency,
          latest_shipment: terms.latest_shipment,
          beneficiary_name: terms.beneficiary_name,
          port_of_loading: terms.port_of_loading,
          applicant_name: terms.applicant_name || "",
          expiry_date: terms.expiry_date || "",
          port_of_discharge: terms.port_of_discharge || "",
          goods_description: terms.goods_description || "",
          incoterms: terms.incoterms || "",
          partial_shipment: terms.partial_shipment || "",
          transhipment: terms.transhipment || "",
          amount_tolerance: terms.amount_tolerance || ""
        });
        
        // Extract confidences
        const confs: Record<string, number> = {};
        Object.keys(terms).forEach(key => {
          if (key.endsWith("_confidence")) {
            const fieldName = key.replace("_confidence", "");
            confs[fieldName] = terms[key];
          }
        });
        setLcConfidences(confs);
        
        addAuditLog(`Bóc tách L/C PDF thành công. Chuyển sang Safety Gate để xác nhận điều khoản.`, "success");
        setScreen("safety_gate");
      }
    } catch (err: any) {
      console.error(err);
      setError("Không thể bóc tách file L/C PDF. Vui lòng dán bức điện SWIFT thô hoặc điền tay.");
      addAuditLog("Bóc tách L/C PDF thất bại.", "warning");
    } finally {
      setIsLCParsing(false);
    }
  };

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      setFiles(prev => {
        const updated = [...prev, ...acceptedFiles];
        addAuditLog(`Đã nhận ${acceptedFiles.length} tệp chứng từ thương mại mới.`, "info");
        return updated;
      });
      setError(null);
    }
  }, [addAuditLog]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    multiple: true
  });

  // Submit check request to FastAPI using Streaming Fetch Reader
  const handleCheck = async () => {
    if (files.length === 0) {
      setError("Vui lòng tải lên ít nhất một file PDF chứng từ cần đối chiếu.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setError(null);
    setExtractedDoc(null);
    setExtractedBl(null);
    setExtractedPl(null);
    setDiscrepancyList([]);
    setCrossDiscrepancies([]);
    setTerminalLogs([]);

    const addTerminalLog = (msg: string) => {
      const t = new Date().toLocaleTimeString();
      setTerminalLogs(prev => [...prev, `[${t}] ${msg}`]);
    };

    try {
      const formData = new FormData();
      files.forEach(f => {
        formData.append("files", f);
      });
      formData.append("lc_rules", JSON.stringify(lcTerms));

      addTerminalLog("Khởi tạo yêu cầu phân tích đa chứng từ...");

      // Call streaming API
      const response = await fetch("http://localhost:8000/api/v1/check-lc", {
        method: "POST",
        body: formData
      });

      if (!response.body) {
        throw new Error("Không thể khởi tạo kết nối luồng (stream response).");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resData: any = null;  // Hoisted so accessible after stream ends

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const payload = JSON.parse(line);
            if (payload.type === "progress") {
              setLoadingStep(payload.msg);
              addTerminalLog(payload.msg);
            } else if (payload.type === "error") {
              setError(payload.msg);
              addTerminalLog(`[LỖI] ${payload.msg}`);
              setIsLoading(false);
              setLoadingStep("");
              return;  // Exit handleCheck early
            } else if (payload.type === "result") {
              resData = payload.data;
              setResult(resData);
              setExtractedDoc(resData.extracted);
              setExtractedBl(resData.extracted_bl);
              setExtractedPl(resData.extracted_pl);
              setDiscrepancyList(resData.discrepancies || []);
              setLayer1Discrepancies(resData.layer1_discrepancies || []);
              setCrossDiscrepancies(resData.cross_discrepancies || []);
              setCannotWaive(resData.cannot_waive || false);
              addTerminalLog("AI Engine đã bóc tách dữ liệu và hoàn tất kiểm toán chéo.");
              addTerminalLog("Đối chiếu UCP 600 thành công.");
            }
          } catch (parseErr) {
            console.warn("Skipping malformed stream chunk:", parseErr);
          }
        }
      }

      addAuditLog("Hoàn tất bóc tách & kiểm toán chéo dữ liệu qua Multi-Agent (Agent 1 & Agent 2)", "success");

      if (resData) {
        const totalErrors = (resData.layer1_discrepancies?.length || 0) + (resData.discrepancies?.length || 0) + (resData.cross_discrepancies?.length || 0);
        if (totalErrors > 0) {
          addAuditLog(`Đối chiếu hoàn tất: Phát hiện ${totalErrors} bất hợp lệ (Nội bộ: ${resData.layer1_discrepancies?.length || 0}, L/C: ${resData.discrepancies?.length || 0}, Chéo: ${resData.cross_discrepancies?.length || 0}).`, "warning");
        } else {
          addAuditLog("Đối chiếu hoàn tất: Các chứng từ hợp lệ toàn phần với điều khoản L/C!", "success");
        }
      }

    } catch (err: any) {
      console.error(err);
      setError(
        err.message || 
        "Đã xảy ra lỗi khi kết nối với máy chủ API. Hãy đảm bảo Backend (FastAPI) đang chạy tại port 8000."
      );
      addAuditLog("Quá trình bóc tách lỗi: Có lỗi xảy ra trong kết nối máy chủ API", "warning");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  // Mock Signing Event (SmartCA)
  const handleSign = () => {
    setIsSigning(true);
    setSignStatus("connecting");
    addAuditLog("Bắt đầu kết nối cổng ký số VNPT SmartCA...", "info");
    
    setTimeout(() => {
      setSignStatus("signing");
      addAuditLog("Đang truyền dữ liệu băm và áp dụng chữ ký số...", "info");
      
      setTimeout(() => {
        setSignStatus("success");
        const newHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join("");
        setTxHash(newHash);
        addAuditLog(`Đã ký duyệt báo cáo thành công qua SmartCA. TxHash: ${newHash.slice(0, 16)}...`, "success");
      }, 1500);
    }, 1000);
  };

  // Start editing a field (HITL)
  const startEditing = (field: keyof ExtractedDoc) => {
    if (!extractedDoc) return;
    setEditingField(field);
    setEditValue(extractedDoc[field].toString());
  };

  // Save edited value (HITL)
  const saveEdit = (field: keyof ExtractedDoc) => {
    if (!extractedDoc) return;
    
    let updatedVal: any = editValue;
    if (field === "total_amount") {
      updatedVal = parseFloat(editValue) || 0.0;
    }

    // When edited by human, set confidence to 1.0 (since verified by human)
    const updatedDoc = {
      ...extractedDoc,
      [field]: updatedVal,
      [`${field}_confidence` as keyof ExtractedDoc]: 1.0
    };

    const labels: Record<string, string> = {
      beneficiary_name: "Người thụ hưởng",
      applicant_name: "Người mua (Applicant)",
      total_amount: "Tổng số tiền",
      currency: "Đồng tiền",
      shipment_date: "Ngày giao hàng",
      port_of_loading: "Cảng bốc hàng",
      port_of_discharge: "Cảng dỡ hàng",
      incoterms: "Incoterms",
      goods_description: "Mô tả hàng hóa"
    };

    setExtractedDoc(updatedDoc);
    setEditingField(null);
    recalculateDiscrepancies(updatedDoc);
    addAuditLog(`Chuyên viên điều chỉnh thủ công trường '${labels[field]}' thành: '${updatedVal}' (HITL)`, "edit");
  };

  // Copy waiver draft email to clipboard
  const handleCopyEmail = () => {
    if (result?.waiver_draft) {
      navigator.clipboard.writeText(result.waiver_draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      addAuditLog("Đã sao chép Thư đề xuất bỏ qua lỗi (Waiver Letter) vào Clipboard", "info");
    }
  };

  const getDiscrepancy = (fieldName: string) => {
    return discrepancyList.find(d => d.field === fieldName);
  };

  const getFieldStatus = (fieldName: string) => {
    if (!extractedDoc) return null;
    const disc = getDiscrepancy(fieldName);
    // IMPORTANT: Use ?? not || to avoid treating 0.0 confidence as falsy
    // confidence=0.0 means AI did not see the field — we MUST show 0% not 100%
    const confidence = (extractedDoc[`${fieldName}_confidence` as keyof ExtractedDoc] as number) ?? 0.0;
    
    if (disc) {
      return {
        isValid: false,
        actual: extractedDoc[fieldName as keyof ExtractedDoc]?.toString() + (fieldName === "total_amount" ? ` ${extractedDoc.currency}` : ""),
        expected: disc.expected_value,
        reason: disc.reason,
        severity: disc.severity,
        quote: extractedDoc[`${fieldName}_quote` as keyof ExtractedDoc] || "",
        confidence
      };
    }
    
    let actualValue = "";
    let expectedValue = "";
    if (fieldName === "invoice_number") {
      actualValue = extractedDoc.invoice_number;
      expectedValue = "Tùy ý / Có hợp lệ";
    } else if (fieldName === "total_amount") {
      actualValue = `${extractedDoc.total_amount.toLocaleString()} ${extractedDoc.currency}`;
      
      const maxAmt = parseFloat(lcTerms.max_amount);
      const amountTolStr = (lcTerms.amount_tolerance || "").trim().toLowerCase();
      let positiveTol = 5.0;
      if (amountTolStr === "0" || amountTolStr.includes("exactly")) {
        positiveTol = 0.0;
      } else if (amountTolStr.includes("/")) {
        const parts = amountTolStr.split("/");
        const p1 = parseFloat(parts[0].replace("%", "").trim());
        if (!isNaN(p1)) positiveTol = p1;
      } else if (amountTolStr) {
        const val = parseFloat(amountTolStr.replace("%", "").trim());
        if (!isNaN(val)) positiveTol = val;
      }
      const maxAllowed = maxAmt * (1 + positiveTol / 100);
      expectedValue = `<= ${maxAllowed.toLocaleString()} ${lcTerms.currency} (Hạn mức ${maxAmt.toLocaleString()} + ${positiveTol}% dung sai)`;
    } else if (fieldName === "currency") {
      actualValue = extractedDoc.currency;
      expectedValue = lcTerms.currency;
    } else if (fieldName === "shipment_date") {
      actualValue = extractedDoc.shipment_date;
      expectedValue = `Trước ${lcTerms.latest_shipment}`;
    } else if (fieldName === "beneficiary_name") {
      actualValue = extractedDoc.beneficiary_name;
      expectedValue = lcTerms.beneficiary_name;
    } else if (fieldName === "port_of_loading") {
      actualValue = extractedDoc.port_of_loading;
      expectedValue = lcTerms.port_of_loading;
    } else if (fieldName === "applicant_name") {
      actualValue = extractedDoc.applicant_name;
      expectedValue = lcTerms.applicant_name;
    } else if (fieldName === "port_of_discharge") {
      actualValue = extractedDoc.port_of_discharge;
      expectedValue = lcTerms.port_of_discharge;
    } else if (fieldName === "incoterms") {
      actualValue = extractedDoc.incoterms;
      expectedValue = lcTerms.incoterms;
    } else if (fieldName === "goods_description") {
      actualValue = extractedDoc.goods_description;
      expectedValue = lcTerms.goods_description;
    }

    return {
      isValid: true,
      actual: actualValue,
      expected: expectedValue,
      reason: "Hoàn toàn trùng khớp và hợp lệ",
      quote: extractedDoc[`${fieldName}_quote` as keyof ExtractedDoc] || "",
      confidence
    };
  };

  // Main Application Multi-Screen Flow Layout
  if (screen === "login") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center font-sans p-6 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl"></div>

        <div className="bg-slate-950/60 border border-slate-800 backdrop-blur-xl w-full max-w-md rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-xl mb-4">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">LC-Vision Enterprise</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-xs leading-normal">
              Hệ thống thẩm định & Đối chiếu chứng từ L/C tự động tích hợp Multi-Agent AI
            </p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            if (username === "admin" && password === "admin") {
              addAuditLog("Chuyên viên đăng nhập thành công vào hệ thống.", "success");
              setScreen("dashboard");
              setLoginError("");
            } else {
              setLoginError("Tên đăng nhập hoặc mật khẩu không chính xác.");
            }
          }} className="space-y-5">
            <div>
              <label className="text-xs text-slate-400 font-bold mb-1.5 block">Tài khoản chuyên viên</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-all font-mono"
                placeholder="Nhập tài khoản"
                required
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 font-bold mb-1.5 block">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-sm text-white focus:outline-none focus:border-blue-500 transition-all font-mono"
                placeholder="Nhập mật khẩu"
                required
              />
            </div>

            {loginError && (
              <p className="text-xs text-rose-500 font-semibold text-center">{loginError}</p>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-lg shadow-blue-900/20"
            >
              Đăng nhập hệ thống
            </button>
          </form>

          <p className="text-[10px] text-slate-500 text-center mt-6">
            Bản quyền thuộc về LC-Vision Hackathon Team — MSB 2026.
          </p>
        </div>
      </div>
    );
  }

  if (screen === "dashboard") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
        <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent">
                  LC-Vision
                </h1>
                <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
                <User className="h-3.5 w-3.5 text-blue-200" />
                <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
              </div>
              <button
                onClick={() => setScreen("login")}
                className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Bảng điều khiển (Dashboard)</h2>
              <p className="text-xs text-slate-500 mt-1">Quản lý và thực hiện kiểm tra chéo, thẩm định chứng từ L/C</p>
            </div>
            <button
              onClick={() => {
                setScreen("upload");
                setFiles([]);
                setLcFile(null);
                setResult(null);
                setExtractedDoc(null);
                setExtractedBl(null);
                setExtractedPl(null);
                setDiscrepancyList([]);
                setCrossDiscrepancies([]);
                setDecisionStatus("idle");
                addAuditLog("Khởi tạo phiên làm việc mới.", "info");
              }}
              className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
            >
              <Upload className="h-4 w-4" />
              <span>+ Tạo kiểm tra mới</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-800 mb-4 uppercase tracking-wider">Danh sách bộ chứng từ gần đây</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-400 font-bold uppercase">
                    <th className="pb-3">Mã Case</th>
                    <th className="pb-3">Tên bộ chứng từ</th>
                    <th className="pb-3">Ngày tạo</th>
                    <th className="pb-3">Trạng thái</th>
                    <th className="pb-3">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {dashboardCases.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 font-mono font-bold text-blue-700 text-xs">{c.id}</td>
                      <td className="py-4 font-bold text-slate-700">{c.name}</td>
                      <td className="py-4 text-slate-400 font-semibold">{c.date}</td>
                      <td className="py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          c.status === "Compliant" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                          c.status === "Closed" ? "bg-rose-50 text-rose-700 border border-rose-100" : "bg-slate-100 text-slate-600"
                        }`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="py-4">
                        <span className="text-xs text-slate-500 font-bold">{c.conclusion}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (screen === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
        <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent cursor-pointer" onClick={() => setScreen("dashboard")}>
                  LC-Vision
                </h1>
                <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
                <User className="h-3.5 w-3.5 text-blue-200" />
                <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
              </div>
              <button
                onClick={() => setScreen("login")}
                className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 mt-8">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400 mb-6">
            <span className="hover:text-blue-700 cursor-pointer" onClick={() => setScreen("dashboard")}>Dashboard</span>
            <span>&gt;</span>
            <span className="text-slate-700">Tạo kiểm tra mới</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: L/C Document Input */}
            <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="text-blue-700 h-5 w-5" />
                  <h2 className="text-md font-bold text-blue-900">Bước 1: Tải lên Thư tín dụng (L/C)</h2>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setLcInputMode("form")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      lcInputMode === "form" ? "bg-white text-blue-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Tệp L/C PDF
                  </button>
                  <button
                    onClick={() => setLcInputMode("swift")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      lcInputMode === "swift" ? "bg-white text-blue-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Bức điện SWIFT
                  </button>
                </div>
              </div>

              {lcInputMode === "swift" ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 font-bold mb-1.5 block">Dán văn bản điện SWIFT MT700 nguyên bản:</label>
                    <textarea
                      rows={8}
                      value={swiftText}
                      onChange={(e) => setSwiftText(e.target.value)}
                      placeholder=":31D: Date and Place of Expiry: 260715\n:50: Applicant: IMPORT CO LTD\n:59: Beneficiary:\nGLOBAL TRADING CORP\n:32B: Currency Code, Amount: USD 50000\n:39A: Percentage Credit Amount Tolerance: 5/5\n:44E: Port of Loading: HAIPHONG PORT\n:44F: Port of Discharge: HAMBURG PORT\n:45A: Description of Goods: AGRICULTURAL PRODUCTS\n:44C: Latest Shipment Date: 2026-06-30"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-700 focus:bg-white transition-all leading-normal"
                    />
                  </div>
                  
                  <button
                    onClick={handleParseSwift}
                    disabled={isParsingSwift}
                    className="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isParsingSwift ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Đang phân tích điện SWIFT...</span>
                      </>
                    ) : (
                      <>
                        <Cpu className="h-3.5 w-3.5" />
                        <span>AI Tự Động Phân Tích L/C (SWIFT)</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 flex-1 flex flex-col justify-between">
                  <div>
                    <label className="text-xs text-slate-500 font-bold mb-2 block">Chọn file PDF của Thư tín dụng (L/C):</label>
                    <div className="border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl p-8 bg-slate-50/20 text-center cursor-pointer transition-all">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLcFileUpload(file);
                        }}
                        className="hidden"
                        id="lc-file-upload"
                      />
                      <label htmlFor="lc-file-upload" className="cursor-pointer">
                        <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3 text-blue-600">
                          <Upload className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-700">Tải lên L/C dạng PDF</p>
                        {lcFile && <p className="text-xs text-emerald-600 font-bold mt-1">Đã chọn: {lcFile.name}</p>}
                        <p className="text-xs text-slate-400 mt-1">Hệ thống sẽ tự nhận diện và bóc tách các điều khoản</p>
                      </label>
                    </div>
                  </div>

                  {isLCParsing && (
                    <div className="flex flex-col items-center justify-center p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                      <Loader2 className="h-6 w-6 text-blue-700 animate-spin mb-2" />
                      <p className="text-xs font-bold text-blue-900">Agent AI đang đọc và OCR tài liệu L/C...</p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Right Column: Commercial Documents Upload */}
            <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                  <Upload className="text-blue-700 h-5 w-5" />
                  <h2 className="text-md font-bold text-blue-900">Bước 2: Bộ chứng từ thương mại cần thẩm định</h2>
                </div>

                <div 
                  {...getRootProps()} 
                  className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-all duration-300 ${
                    isDragActive 
                      ? "border-blue-600 bg-blue-50/30" 
                      : files.length > 0
                        ? "border-slate-300 bg-slate-50/50" 
                        : "border-slate-200 hover:border-slate-300 bg-slate-50/20"
                  }`}
                >
                  <input {...getInputProps()} />
                  {files.length > 0 ? (
                    <div className="w-full text-center">
                      <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4 border border-emerald-200 text-emerald-600">
                        <FileCheck className="h-6 w-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 mb-2">Đã chọn ({files.length}) chứng từ:</h4>
                      <div className="space-y-2 max-h-40 overflow-y-auto text-left mb-4">
                        {files.map((f, i) => (
                          <div key={i} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200 text-xs">
                            <span className="truncate font-semibold text-slate-700 max-w-[200px]">{f.name}</span>
                            <span className="text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                          </div>
                        ))}
                      </div>
                      <button 
                        type="button" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles([]);
                        }}
                        className="mt-2 text-xs font-semibold text-rose-600 hover:text-rose-500 underline"
                      >
                        Hủy bỏ tất cả & chọn lại
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
                        <Upload className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">
                        Kéo & thả các file PDF chứng từ vào đây
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        (Commercial Invoice, Bill of Lading, Packing List)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {error && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex gap-2.5 items-start">
                    <XCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (files.length === 0) {
                      setError("Vui lòng tải lên ít nhất một file PDF chứng từ cần đối chiếu.");
                      return;
                    }
                    setScreen("safety_gate");
                  }}
                  className="w-full py-4 rounded-xl bg-blue-950 hover:bg-blue-900 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10"
                >
                  <span>Kiểm duyệt điều khoản L/C &gt;&gt;</span>
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  if (screen === "safety_gate") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
        <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent cursor-pointer" onClick={() => setScreen("dashboard")}>
                  LC-Vision
                </h1>
                <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
                <User className="h-3.5 w-3.5 text-blue-200" />
                <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
              </div>
              <button
                onClick={() => setScreen("login")}
                className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 mt-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-md">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-6">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Bước 3B: Xác nhận Điều khoản L/C (Safety Gate)</h2>
                <p className="text-xs text-slate-500 mt-0.5">Vui lòng rà soát lại thông tin tham chiếu L/C do AI tự động bóc tách trước khi chạy đối chiếu.</p>
              </div>
            </div>

            {/* Expiry Check Warning Block */}
            {(() => {
              const expDateStr = lcTerms.expiry_date;
              const isExpired = expDateStr ? new Date(expDateStr) < new Date("2026-06-26") : false;
              if (isExpired) {
                return (
                  <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-3 items-start animate-pulse">
                    <XCircle className="h-6 w-6 text-rose-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm">L/C ĐÃ HẾT HẠN - KHÔNG THỂ TIẾP TỤC</h4>
                      <p className="mt-1 leading-normal">
                        Hạn hết hạn của L/C là <strong>{expDateStr}</strong>, trước thời điểm xử lý chứng từ hiện tại (2026-06-26).
                        Quy trình thẩm định bị chặn đứng hoàn toàn do L/C đã quá hạn hiệu lực và không được phép Waiver theo điều lệ UCP 600.
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Table of terms */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: "Tên bên thụ hưởng (Beneficiary)", field: "beneficiary_name", value: lcTerms.beneficiary_name },
                  { label: "Tên người mua (Applicant)", field: "applicant_name", value: lcTerms.applicant_name },
                  { label: "Hạn mức L/C tối đa", field: "max_amount", value: `${parseFloat(lcTerms.max_amount).toLocaleString()} ${lcTerms.currency}` },
                  { label: "Dung sai số tiền (Tolerance)", field: "amount_tolerance", value: lcTerms.amount_tolerance || "5/5" },
                  { label: "Cảng xếp hàng (Port of Loading)", field: "port_of_loading", value: lcTerms.port_of_loading },
                  { label: "Cảng dỡ hàng (Port of Discharge)", field: "port_of_discharge", value: lcTerms.port_of_discharge },
                  { label: "Thời hạn giao hàng (Latest Shipment)", field: "latest_shipment", value: lcTerms.latest_shipment },
                  { label: "Ngày hết hạn (Expiry Date)", field: "expiry_date", value: lcTerms.expiry_date },
                  { label: "Điều kiện giao hàng (Incoterms)", field: "incoterms", value: lcTerms.incoterms || "CIF" },
                  { label: "Mô tả hàng hóa (Goods Description)", field: "goods_description", value: lcTerms.goods_description }
                ].map(item => {
                  const conf = lcConfidences[item.field];
                  const isLowConfidence = conf !== undefined && conf < 0.8;
                  return (
                    <div key={item.field} className={`p-4 rounded-xl border transition-all ${
                      isLowConfidence ? "border-amber-200 bg-amber-50/30" : "border-slate-100 bg-slate-50/50"
                    }`}>
                      <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">{item.label}</span>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-sm font-bold text-slate-800">{item.value || "(Chưa có)"}</span>
                        
                        {isLowConfidence && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse shrink-0">
                            ⚠️ Cần kiểm tra kỹ ({Math.round(conf * 100)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 mt-8 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setScreen("upload")}
                  className="px-6 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
                >
                  Quay lại
                </button>
                <button
                  onClick={() => {
                    setScreen("result");
                    handleCheck();
                  }}
                  disabled={(() => {
                    const expDateStr = lcTerms.expiry_date;
                    return expDateStr ? new Date(expDateStr) < new Date("2026-06-26") : false;
                  })()}
                  className="flex-1 py-3.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-center shadow-lg"
                >
                  Xác nhận & Bắt đầu kiểm tra chéo
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // screen === "result"
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      {/* Navbar: Enterprise Bank Theme */}
      <header className="border-b border-blue-900/10 bg-slate-900 text-white sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-100 to-white bg-clip-text text-transparent cursor-pointer" onClick={() => setScreen("dashboard")}>
                LC-Vision
              </h1>
              <p className="text-[10px] text-blue-200 uppercase tracking-widest font-bold">Hệ thống thẩm định L/C ngân hàng</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-blue-950/60 px-4 py-1.5 rounded-full border border-blue-800/60">
              <User className="h-3.5 w-3.5 text-blue-200" />
              <span className="text-xs text-blue-100 font-mono font-semibold">Chuyên viên: {username}</span>
            </div>
            <button
              onClick={() => setScreen("login")}
              className="text-xs text-blue-200 hover:text-white transition-colors underline font-semibold"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: Inputs (Ground Truth read-only review) */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          {/* L/C Requirements Card (Read-only reference) */}
          <div className="bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-700 h-5 w-5" />
                <h2 className="text-md font-bold text-blue-900">1. Điều khoản L/C tham chiếu (Ground Truth)</h2>
              </div>
              <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-100 uppercase">Confirmed</span>
            </div>

            <div className="grid grid-cols-1 gap-3.5 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Người thụ hưởng</span>
                  <span className="font-semibold text-slate-800">{lcTerms.beneficiary_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Người mua (Applicant)</span>
                  <span className="font-semibold text-slate-800">{lcTerms.applicant_name}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-2.5">
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Hạn mức</span>
                  <span className="font-mono font-semibold text-slate-800">{parseFloat(lcTerms.max_amount).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Tiền tệ</span>
                  <span className="font-mono font-semibold text-slate-800">{lcTerms.currency}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Dung sai</span>
                  <span className="font-mono font-semibold text-slate-800">{lcTerms.amount_tolerance}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-2.5">
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Hạn giao hàng</span>
                  <span className="font-semibold text-slate-800">{lcTerms.latest_shipment}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Ngày hết hạn</span>
                  <span className="font-semibold text-slate-800">{lcTerms.expiry_date}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-2.5">
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Cảng xếp</span>
                  <span className="font-semibold text-slate-800">{lcTerms.port_of_loading}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block uppercase tracking-wider">Cảng dỡ</span>
                  <span className="font-semibold text-slate-800">{lcTerms.port_of_discharge}</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-2.5">
                <span className="text-slate-400 font-bold block uppercase tracking-wider">Mô tả hàng hóa</span>
                <span className="font-semibold text-slate-800">{lcTerms.goods_description}</span>
              </div>
            </div>
            
            <button
              onClick={() => setScreen("upload")}
              className="w-full py-2.5 mt-5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all text-center"
            >
              Thay đổi tệp L/C & chứng từ
            </button>
          </div>

          {/* Audit Trail Section */}
          {!isLoading && auditLogs.length > 0 && (
            <div className="bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <Clock className="text-blue-700 h-5 w-5" />
                <h3 className="text-sm font-bold text-blue-900">Nhật ký vận hành (Audit Trail)</h3>
              </div>
              
              <div className="relative border-l-2 border-slate-200 pl-4 ml-2 space-y-4 max-h-52 overflow-y-auto">
                {auditLogs.map((log, index) => {
                  let dotColor = "bg-slate-300";
                  if (log.type === "success") dotColor = "bg-emerald-500";
                  if (log.type === "warning") dotColor = "bg-rose-500";
                  if (log.type === "edit") dotColor = "bg-blue-600";

                  return (
                    <div key={index} className="relative text-xs">
                      <span className={`absolute -left-[23px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white ${dotColor} shadow-sm`}></span>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-mono">{log.time}</span>
                        <p className="text-slate-700 font-medium mt-0.5">{log.message}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right column: Results & Sign Area */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          
          {/* Live Terminal logs panel */}
          {terminalLogs.length > 0 && (
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 shadow-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 pb-2 border-b border-slate-900/60">
                <Terminal className="h-4 w-4 text-emerald-400" />
                <span>Trình giám sát tác nhân AI (Live Console)</span>
              </div>
              <div className="bg-slate-950/80 font-mono text-[10px] text-emerald-400 p-3 rounded-xl border border-slate-900 shadow-inner h-36 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
                {terminalLogs.map((log, index) => (
                  <div key={index} className="leading-relaxed animate-[fadeIn_0.2s_ease-out]">
                    {log}
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}

          {/* Waiting/Processing State */}
          {isLoading && (
            <div className="bg-white border border-blue-900/5 rounded-2xl p-12 shadow-md flex flex-col items-center justify-center text-center min-h-[480px]">
              <Loader2 className="h-10 w-10 text-blue-700 animate-spin mb-6" />
              <h3 className="text-lg font-bold text-blue-900 mb-2">Đang phân tích bộ chứng từ</h3>
              <p className="text-sm text-slate-500 max-w-sm mb-6">
                Các Agent AI đang bóc tách hình ảnh PDF gốc bằng GPT-4o Vision và thực hiện rà soát, kiểm toán độc lập.
              </p>
              
              <div className="w-64 bg-slate-100 rounded-full h-2 border border-slate-200 overflow-hidden relative">
                <div className="h-full bg-blue-900 rounded-full animate-[loading_2.5s_infinite] absolute"></div>
              </div>
              <p className="text-xs text-blue-700 font-bold font-mono mt-5">
                {loadingStep}
              </p>
            </div>
          )}

          {/* Results Render */}
          {!isLoading && extractedDoc && (
            <div className="bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md flex flex-col justify-between min-h-[560px]">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-blue-900">Báo cáo thẩm định (Compliance Report)</h2>
                    <p className="text-xs text-slate-400">Số hóa đơn: <span className="font-mono text-blue-700 font-bold">{extractedDoc.invoice_number || "N/A"}</span></p>
                  </div>
                  <div className={`px-3.5 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                    (discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length) > 0
                      ? "bg-rose-50 border-rose-100 text-rose-700"
                      : "bg-emerald-50 border-emerald-100 text-emerald-700"
                  }`}>
                    {(discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length) > 0 ? (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Phát hiện {discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length} sai biệt</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Chứng từ tuân thủ tuyệt đối</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Tab Switcher (BA v2.0 TO-BE) */}
                <div className="flex border-b border-slate-100 mb-5">
                  <button
                    onClick={() => setActiveTab("internal")}
                    className={`pb-3 text-xs font-bold transition-all px-4 relative ${
                      activeTab === "internal" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Kiểm tra nội bộ (Layer 1)
                    {layer1Discrepancies.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-[9px] font-bold">
                        {layer1Discrepancies.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("cross")}
                    className={`pb-3 text-xs font-bold transition-all px-4 relative ${
                      activeTab === "cross" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Kiểm tra chéo chứng từ (Layer 2)
                    {crossDiscrepancies.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-[9px] font-bold">
                        {crossDiscrepancies.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveTab("lc")}
                    className={`pb-3 text-xs font-bold transition-all px-4 relative ${
                      activeTab === "lc" ? "text-blue-900 font-extrabold border-b-2 border-blue-900" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Đối chiếu L/C (Layer 3)
                    {discrepancyList.length > 0 && (
                      <span className="ml-1.5 px-1.5 py-0.2 bg-rose-600 text-white rounded-full text-[9px] font-bold">
                        {discrepancyList.length}
                      </span>
                    )}
                  </button>
                </div>

                {activeTab === "lc" ? (
                  <>
                    <div className="mb-4 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5">
                      <HelpCircle className="h-4.5 w-4.5 text-blue-700 shrink-0 mt-0.5" />
                      <span>
                        <strong>Human-in-the-Loop (HITL):</strong> Chuyên viên có thể sửa đổi dữ liệu sai lệch bằng nút bút chì ở cột <strong>Chứng từ thực tế (AI)</strong>. Hệ thống sẽ so khớp lại ngay tức thì.
                      </span>
                    </div>

                    {/* Diff table */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-100 text-xs text-slate-500 uppercase tracking-wider">
                            <th className="pb-3 font-bold">Trường dữ liệu</th>
                            <th className="pb-3 font-bold">Yêu cầu L/C</th>
                            <th className="pb-3 font-bold">Chứng từ thực tế (AI)</th>
                            <th className="pb-3 font-bold text-center">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {["beneficiary_name", "applicant_name", "total_amount", "currency", "shipment_date", "port_of_loading", "port_of_discharge", "incoterms", "goods_description"].map(field => {
                            const status = getFieldStatus(field);
                            if (!status) return null;

                            const labels: Record<string, string> = {
                              beneficiary_name: "Người thụ hưởng",
                              applicant_name: "Người mua (Applicant)",
                              total_amount: "Tổng số tiền",
                              currency: "Đồng tiền",
                              shipment_date: "Ngày giao hàng",
                              port_of_loading: "Cảng bốc hàng",
                              port_of_discharge: "Cảng dỡ hàng",
                              incoterms: "Incoterms",
                              goods_description: "Mô tả hàng hóa"
                            };

                            const isEditing = editingField === field;
                            const isLowConfidence = status.confidence < 0.8;

                            return (
                              <React.Fragment key={field}>
                                <tr className={`transition-colors ${status.isValid ? "bg-emerald-50/20 hover:bg-emerald-50/40" : "bg-rose-50/30 hover:bg-rose-50/50"}`}>
                                  <td className="py-4 font-bold text-slate-700">
                                    {labels[field]}
                                  </td>
                                  <td className="py-4 text-slate-500 font-mono text-xs">
                                    {status.expected}
                                  </td>
                                  <td className="py-2.5">
                                    {isEditing ? (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type={field === "total_amount" ? "number" : "text"}
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="bg-white border border-blue-500 rounded px-2 py-1 text-xs text-slate-800 focus:outline-none w-36 font-mono"
                                          autoFocus
                                        />
                                        <button 
                                          onClick={() => saveEdit(field as keyof ExtractedDoc)}
                                          className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                                        >
                                          <Check className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 group">
                                          <span className={`font-mono text-xs font-semibold ${status.isValid ? "text-slate-800" : "text-rose-700"}`}>
                                            {status.actual}
                                          </span>
                                          
                                          {/* Confidence score badge */}
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                                            isLowConfidence 
                                              ? "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse" 
                                              : "bg-blue-50 text-blue-700"
                                          }`}>
                                            Tin cậy: {Math.round(status.confidence * 100)}%
                                          </span>

                                          {isLowConfidence && (
                                            <div className="flex items-center gap-1 text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                              <AlertTriangle className="h-3 w-3 text-amber-600" />
                                              <span>Kiểm tra lại</span>
                                            </div>
                                          )}

                                          <button 
                                            onClick={() => startEditing(field as keyof ExtractedDoc)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-blue-700"
                                            title="Click để sửa lỗi thủ công"
                                          >
                                            <Edit2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                        {/* Raw quotes */}
                                        {status.quote && (
                                          <div className="text-[10px] text-slate-500 italic max-w-xs break-all bg-slate-50 p-1.5 rounded border border-slate-200/60 leading-normal">
                                            Trích dẫn gốc: "{status.quote}"
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-4 text-center">
                                    {status.isValid ? (
                                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                        <CheckCircle className="h-4 w-4" />
                                      </span>
                                    ) : (
                                      <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full ${
                                        status.severity === "Warning" 
                                          ? "bg-amber-100 text-amber-700 border border-amber-200" 
                                          : "bg-rose-100 text-rose-700 border border-rose-200"
                                      }`}>
                                        {status.severity === "Warning" ? (
                                          <AlertTriangle className="h-4 w-4" />
                                        ) : (
                                          <XCircle className="h-4 w-4" />
                                        )}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                                {!status.isValid && (
                                  <tr className="bg-rose-50/10">
                                    <td colSpan={4} className="py-2.5 px-4 text-xs text-rose-700 font-semibold italic border-l-2 border-rose-500">
                                      {status.reason}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : activeTab === "cross" ? (
                  <div className="space-y-4">
                    {crossDiscrepancies.length === 0 ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                        <CheckCircle className="h-10 w-10 text-emerald-600 mb-3" />
                        <h4 className="text-sm font-bold text-emerald-900">Nhất quán toàn bộ dữ liệu</h4>
                        <p className="text-xs text-emerald-700 mt-1 max-w-sm">
                          Không phát hiện sai biệt chéo (Layer 2) giữa Hóa đơn thương mại, Vận đơn (B/L) và Phiếu đóng gói (Packing List).
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {crossDiscrepancies.map((disc, idx) => (
                          <div key={idx} className="bg-rose-50/20 border border-rose-100/60 p-4 rounded-xl flex flex-col gap-2 animate-[fadeIn_0.3s_ease-out]">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                                {disc.field === "cross_beneficiary_shipper" ? "Beneficiary ↔ Shipper" :
                                 disc.field === "cross_goods_invoice_bl" ? "Mô tả hàng (Invoice ↔ B/L)" :
                                 disc.field === "cross_goods_invoice_pl" ? "Mô tả hàng (Invoice ↔ PL)" :
                                 disc.field === "cross_loading_port" ? "Cảng bốc hàng" :
                                 disc.field === "cross_discharge_port" ? "Cảng dỡ hàng" : "Sai biệt"}
                              </span>
                              <span className="bg-rose-100 text-rose-700 text-[9px] px-2 py-0.5 rounded font-bold uppercase">
                                {disc.severity}
                              </span>
                            </div>
                            <p className="text-xs text-rose-950 font-semibold">{disc.reason}</p>
                            <div className="grid grid-cols-2 gap-4 mt-1 bg-white p-3 rounded-lg border border-slate-100 text-xs font-mono">
                              <div>
                                <div className="text-slate-400 text-[8px] uppercase font-bold">Giá trị thực tế</div>
                                <div className="text-rose-700 font-bold mt-0.5 break-all">{disc.actual_value}</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-[8px] uppercase font-bold">Giá trị đối chiếu</div>
                                <div className="text-slate-700 font-bold mt-0.5 break-all">{disc.expected_value}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {layer1Discrepancies.length === 0 ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                        <CheckCircle className="h-10 w-10 text-emerald-600 mb-3" />
                        <h4 className="text-sm font-bold text-emerald-900">Chứng từ hoàn toàn hợp lệ nội bộ</h4>
                        <p className="text-xs text-emerald-700 mt-1 max-w-sm">
                          Hóa đơn thương mại, Vận đơn và Phiếu đóng gói đáp ứng đầy đủ các kiểm tra cấu trúc nội bộ (Layer 1).
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {layer1Discrepancies.map((disc, idx) => (
                          <div key={idx} className={`border p-4 rounded-xl flex flex-col gap-2 animate-[fadeIn_0.3s_ease-out] ${
                            disc.severity === "Warning" ? "bg-amber-50/20 border-amber-100/60" : "bg-rose-50/20 border-rose-100/60"
                          }`}>
                            <div className="flex justify-between items-center">
                              <span className={`text-xs font-bold uppercase tracking-wider ${
                                disc.severity === "Warning" ? "text-amber-800" : "text-rose-800"
                              }`}>
                                {disc.field}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                                disc.severity === "Warning" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                              }`}>
                                {disc.severity}
                              </span>
                            </div>
                            <p className={`text-xs font-semibold ${
                              disc.severity === "Warning" ? "text-amber-950" : "text-rose-950"
                            }`}>{disc.reason}</p>
                            <div className="grid grid-cols-2 gap-4 mt-1 bg-white p-3 rounded-lg border border-slate-100 text-xs font-mono">
                              <div>
                                <div className="text-slate-400 text-[8px] uppercase font-bold">Thực tế bóc tách</div>
                                <div className={`font-bold mt-0.5 break-all ${
                                  disc.severity === "Warning" ? "text-amber-700" : "text-rose-700"
                                }`}>{disc.actual_value}</div>
                              </div>
                              <div>
                                <div className="text-slate-400 text-[8px] uppercase font-bold">Tiêu chuẩn nghiệp vụ</div>
                                <div className="text-slate-700 font-bold mt-0.5 break-all">{disc.expected_value}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Expiry Absolute Block Message */}
              {cannotWaive && (
                <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-3 items-start animate-[fadeIn_0.4s_ease-out]">
                  <XCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-extrabold text-sm uppercase">L/C QUÁ HẠN XUẤT TRÌNH - TỪ CHỐI THANH TOÁN TUYỆT ĐỐI</h4>
                    <p className="mt-1 leading-normal">
                      Hồ sơ bị từ chối tuyệt đối do ngày xuất trình chứng từ vượt quá ngày hết hạn hiệu lực của L/C. 
                      Theo các nguyên tắc UCP 600, lỗi này thuộc nhóm bất hợp lệ tuyệt đối, <strong>không thể áp dụng cơ chế xin Waiver (bỏ qua lỗi) từ khách hàng</strong>. 
                      Hành động tạo Waiver Letter đã bị hệ thống khóa.
                    </p>
                  </div>
                </div>
              )}

              {/* Action Decision buttons (BA v2.0 TO-BE) */}
              <div className="border-t border-slate-100 pt-4 mt-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="text-xs text-slate-500 text-center sm:text-left font-medium">
                  Báo cáo được lập tự động bởi AI và được kiểm duyệt chéo theo chuẩn L/C UCP 600.
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {(discrepancyList.length + crossDiscrepancies.length + layer1Discrepancies.length) === 0 ? (
                    <button
                      onClick={() => {
                        setDecisionStatus("payout");
                        addAuditLog("Chuyên viên xác nhận COMPLIANT. Hồ sơ đủ điều kiện giải ngân.", "success");
                      }}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
                    >
                      <CheckCircle className="h-4 w-4" />
                      <span>Xác nhận & Giải ngân</span>
                    </button>
                  ) : (
                    <>
                      {!cannotWaive && (
                        <button
                          onClick={() => {
                            setDecisionStatus("pending_customer");
                            addAuditLog("Chuyên viên gửi đề xuất Waiver đến Applicant. Trạng thái: Pending Customer Decision", "info");
                          }}
                          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Mail className="h-4 w-4" />
                          <span>Gửi Đề Xuất Waiver</span>
                        </button>
                      )}
                      <button
                        onClick={() => setIsRejectModalOpen(true)}
                        className="w-full sm:w-auto px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-lg"
                      >
                        <XCircle className="h-4 w-4" />
                        <span>Từ chối thanh toán</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

            </div>
          )}

        </section>

      </main>

      {/* Next Action Area - Decisions (Appears after action selected) */}
      {!isLoading && extractedDoc && decisionStatus !== "idle" && (
        <section className="max-w-7xl mx-auto px-6 mt-8">
          {decisionStatus === "payout" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out] flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-md font-bold text-emerald-900">Hồ sơ đã được phê duyệt giải ngân</h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Bộ chứng từ tuân thủ (Compliant). Hệ thống đã tự động kích hoạt tiến trình giải ngân sang phòng nghiệp vụ thanh toán quốc tế.
                </p>
              </div>
            </div>
          )}

          {decisionStatus === "compliant_with_waiver" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out] flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-md font-bold text-emerald-900">Compliant with Waiver (Đã chấp thuận)</h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Khách hàng (Applicant) đã chính thức đồng ý chấp nhận bỏ qua các sai lệch chứng từ. Bộ hồ sơ chuyển trạng thái đủ điều kiện giải ngân.
                </p>
              </div>
            </div>
          )}

          {decisionStatus === "rejected" && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out] flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200 mt-0.5">
                <XCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-md font-bold text-rose-900">Từ chối thanh toán thành công (Closed — Rejected)</h3>
                <p className="text-sm text-rose-700 mt-1">
                  <strong>Lý do từ chối:</strong> {rejectReason}
                </p>
                <p className="text-xs text-rose-500 mt-2 font-mono">
                  Ghi chú: Lịch sử và lý do từ chối đã được lưu trữ an toàn trong Nhật ký vận hành hệ thống.
                </p>
              </div>
            </div>
          )}

          {decisionStatus === "pending_customer" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md animate-[fadeIn_0.5s_ease-out]">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-100 pb-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Mail className="text-blue-700 h-5 w-5" />
                    <div>
                      <h3 className="text-lg font-bold text-blue-900">Thư yêu cầu xin bỏ qua lỗi (Waiver Request)</h3>
                      <p className="text-xs text-amber-600 font-semibold uppercase tracking-wider mt-0.5">Trạng thái: Pending Customer Decision</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 md:mt-0">
                    <button
                      onClick={handleCopyEmail}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200"
                    >
                      {copied ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <Check className="h-3.5 w-3.5" /> Đã sao chép!
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Copy className="h-3.5 w-3.5" /> Sao chép thư
                        </span>
                      )}
                    </button>
                    <a
                      href={`mailto:?subject=Thong bao vướng mắc L/C &body=${encodeURIComponent(result?.waiver_draft || "")}`}
                      className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>Gửi Email</span>
                    </a>
                  </div>
                </div>

                <p className="text-xs text-slate-500 mb-4">
                  AI đã tự động soạn thảo thư đề xuất bỏ qua lỗi (Waiver Letter) song ngữ để xin ý kiến phản hồi chấp thuận từ phía Người mua hàng (Applicant).
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 font-sans text-sm text-slate-700 whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed border-l-4 border-amber-500">
                  {result?.waiver_draft}
                </div>
              </div>

              {/* Customer Response Simulator (BA v2.0 requirements) */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-md flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    <span>Mô phỏng Khách hàng (Applicant)</span>
                  </h3>
                  <p className="text-xs text-slate-500 leading-normal">
                    Trình mô phỏng quyết định của người nhập khẩu khi nhận được thư yêu cầu Waiver của ngân hàng.
                  </p>
                </div>

                <div className="space-y-3 mt-6">
                  <button
                    onClick={() => {
                      setDecisionStatus("compliant_with_waiver");
                      addAuditLog("Khách hàng (Applicant) đã đồng ý bỏ qua các lỗi sai biệt chứng từ (Waiver Accepted).", "success");
                    }}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Check className="h-4 w-4" />
                    <span>Chấp nhận Waiver (Đồng ý lỗi)</span>
                  </button>
                  <button
                    onClick={() => {
                      setDecisionStatus("rejected");
                      setRejectReason("Người mua từ chối chấp nhận sai biệt chứng từ thương mại.");
                      addAuditLog("Khách hàng (Applicant) từ chối Waiver các lỗi sai biệt chứng từ.", "warning");
                    }}
                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Từ chối Waiver (Hủy thanh toán)</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Audit Trail Section */}
      {!isLoading && auditLogs.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 mt-8">
          <div className="bg-white border border-blue-900/5 rounded-2xl p-6 shadow-md">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-4">
              <Clock className="text-blue-700 h-5 w-5" />
              <h3 className="text-lg font-bold text-blue-900">Nhật ký vận hành (Audit Trail)</h3>
            </div>
            
            <div className="relative border-l-2 border-slate-200 pl-6 ml-3 space-y-4 max-h-60 overflow-y-auto">
              {auditLogs.map((log, index) => {
                let dotColor = "bg-slate-300";
                if (log.type === "success") dotColor = "bg-emerald-500";
                if (log.type === "warning") dotColor = "bg-rose-500";
                if (log.type === "edit") dotColor = "bg-blue-600";

                return (
                  <div key={index} className="relative">
                    {/* Dot decoration */}
                    <span className={`absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${dotColor} shadow-sm`}></span>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <p className="text-xs text-slate-400 font-mono font-semibold">{log.time}</p>
                      <p className="text-sm text-slate-700 flex-1 sm:ml-4 font-medium">{log.message}</p>
                      <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                        log.type === "success" 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                          : log.type === "warning"
                            ? "bg-rose-50 text-rose-700 border border-rose-100"
                            : log.type === "edit"
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-slate-100 text-slate-500"
                      }`}>
                        {log.type === "edit" ? "HIỆU CHỈNH" : log.type}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Rejection Reason Modal (BA v2.0 TO-BE) */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-rose-600"></div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Từ chối thanh toán</h3>
            <p className="text-xs text-slate-500 mb-4">Vui lòng nhập lý lý do từ chối thanh toán bộ chứng từ này:</p>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nhập lý do từ chối cụ thể (ví dụ: Số tiền vượt hạn mức, Trễ hạn giao hàng)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-rose-500 focus:bg-white transition-all leading-normal mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  if (!rejectReason.trim()) {
                    alert("Vui lòng nhập lý do từ chối.");
                    return;
                  }
                  setDecisionStatus("rejected");
                  setIsRejectModalOpen(false);
                  addAuditLog(`Chuyên viên quyết định TỪ CHỐI THANH TOÁN. Lý do: ${rejectReason}`, "warning");
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tailwind internal animation config helper */}
      <style jsx global>{`
        @keyframes loading {
          0% { left: -100%; width: 50%; }
          50% { width: 40%; }
          100% { left: 100%; width: 50%; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
