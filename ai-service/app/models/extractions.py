"""Pydantic schemas for LLM structured extraction from trade PDFs."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class BillOfLadingExtraction(BaseModel):
    carrier: Optional[str] = Field(description="Carrier name, e.g., MAERSK LINE")
    bl_number: Optional[str] = Field(description="Bill of Lading number")
    bl_date: Optional[str] = Field(description="Date of the Bill of Lading (YYYY-MM-DD)")
    shipper_name: Optional[str] = Field(description="Name of the shipper")
    shipper_address: Optional[str] = Field(description="Address of the shipper")
    consignee: Optional[str] = Field(
        description="Consignee details, keep 'TO ORDER OF' if present"
    )
    notify_party_name: Optional[str] = Field(description="Name of the notify party")
    notify_party_address: Optional[str] = Field(description="Address of the notify party")
    vessel: Optional[str] = Field(description="Vessel name")
    voyage_number: Optional[str] = Field(description="Voyage number")
    port_of_loading: Optional[str] = Field(description="Port of loading")
    port_of_discharge: Optional[str] = Field(description="Port of discharge")
    container_no: Optional[str] = Field(description="Container number")
    seal_no: Optional[str] = Field(description="Seal number")
    cargo_description: Optional[str] = Field(description="Description of goods")
    hs_code: Optional[str] = Field(description="HS Code")
    origin: Optional[str] = Field(description="Origin of goods, e.g., Korea")
    container_type_quantity: Optional[str] = Field(
        description="Quantity and type of containers, e.g., 1 x 20GP"
    )
    package_quantity: Optional[str] = Field(
        description="Quantity of packages, e.g., 1000 CARTONS"
    )
    product_quantity: Optional[int] = Field(
        description="Quantity of individual products/units, e.g., 500"
    )
    net_weight: Optional[str] = Field(
        description="Net weight including unit, e.g., 3250 KGS"
    )
    gross_weight: Optional[str] = Field(
        description="Gross weight including unit, e.g., 3650 KGS"
    )
    freight_terms: Optional[str] = Field(
        description="Freight terms, e.g., FREIGHT PREPAID"
    )
    place_of_issue: Optional[str] = Field(description="Place of B/L issue")


class CommercialInvoiceExtraction(BaseModel):
    invoice_number: Optional[str] = Field(
        description="Invoice number, e.g., TPH-CI-2201/2026"
    )
    invoice_date: Optional[str] = Field(description="Date of the invoice")
    seller_name: Optional[str] = Field(description="Shipper/Exporter (Seller) name")
    seller_address: Optional[str] = Field(description="Address of the seller")
    buyer_name: Optional[str] = Field(description="Consignee (Buyer) name")
    buyer_address: Optional[str] = Field(description="Address of the buyer")
    contract_number: Optional[str] = Field(description="Contract number and date")
    lc_details: Optional[str] = Field(
        description="L/C number, date, and issuing bank details"
    )
    port_of_loading: Optional[str] = Field(description="Port of loading")
    port_of_discharge: Optional[str] = Field(description="Port of discharge")
    vessel_name: Optional[str] = Field(description="Vessel name")
    shipment_date: Optional[str] = Field(description="Date of shipment")
    container_number: Optional[str] = Field(description="Container number")
    bl_number: Optional[str] = Field(description="Bill of Lading (B/L) number")
    goods_description: Optional[str] = Field(
        description="Detailed description of goods including model, year, etc."
    )
    quantity: Optional[str] = Field(
        description="Total quantity and unit, e.g., 500 units"
    )
    unit_price: Optional[str] = Field(
        description="Unit price including currency, e.g., 200 USD/unit"
    )
    price_term: Optional[str] = Field(
        description="Price term and incoterms, e.g., CIF CAT LAI PORT..."
    )
    total_amount: Optional[str] = Field(
        description="Total amount including currency, e.g., 100,000.00 USD"
    )
    total_in_words: Optional[str] = Field(description="Total amount in words")
    beneficiary_bank_details: Optional[str] = Field(
        description="Full beneficiary bank details including bank name, account no, SWIFT"
    )


class PackingListExtraction(BaseModel):
    packing_list_number: Optional[str] = Field(
        description="Packing List Number (Số phiếu đóng gói), e.g., TPH-CI-2201/2026"
    )
    date: Optional[str] = Field(
        description="Date of the Packing List (Ngày lập), e.g., Feb 02, 2026 or 02/02/2026"
    )
    seller_name: Optional[str] = Field(description="Seller/Exporter name (Người bán)")
    seller_address: Optional[str] = Field(description="Seller address (Địa chỉ người bán)")
    buyer_name: Optional[str] = Field(description="Buyer/Importer name (Người mua)")
    buyer_address: Optional[str] = Field(description="Buyer address (Địa chỉ người mua)")
    invoice_number: Optional[str] = Field(description="Invoice Number (Số hóa đơn)")
    port_of_loading: Optional[str] = Field(description="Port of Loading (Cảng bốc hàng)")
    port_of_discharge: Optional[str] = Field(description="Port of Discharge (Cảng dỡ hàng)")
    goods_description: Optional[str] = Field(description="Description of Goods (Mô tả hàng hóa)")
    year_of_manufacture: Optional[int] = Field(
        description="Year of Manufacture (Năm sản xuất)"
    )
    origin: Optional[str] = Field(description="Origin (Xuất xứ), e.g., Korea")
    quantity: Optional[str] = Field(
        description="Quantity with unit (Số lượng), e.g., 500 units"
    )
    total_gross_weight: Optional[str] = Field(
        description="Total Gross Weight with unit (Tổng trọng lượng), e.g., 3,650 kg"
    )
    unit_price: Optional[str] = Field(
        description="Unit price with currency (Đơn giá), e.g., 200 USD/units"
    )
    total_amount: Optional[str] = Field(
        description="Total Amount with currency (Tổng số tiền), e.g., 100,000.00 USD"
    )
    packaging_details: Optional[str] = Field(
        description="Packaging details and specifications (Quy cách đóng gói)"
    )
    price_term: Optional[str] = Field(
        description="Price term / Incoterms (Điều kiện giá)"
    )
