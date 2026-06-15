# -*- coding: utf-8 -*-
"""Gera PDF da validacao de repactuacoes, reutilizando os dados de gerar_comparacao.py."""
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph,
                                Spacer, KeepTogether)
import gerar_comparacao as G  # importa sections (e regrava o xlsx, sem problema)

OK,CONF,DIV,NA = "OK","CONF","DIV","NA"
C = {OK:colors.HexColor("#C6EFCE"), CONF:colors.HexColor("#FFEB9C"),
     DIV:colors.HexColor("#FFC7CE"), NA:colors.HexColor("#F2F2F2")}
HDR = colors.HexColor("#1F4E78")
SEC = colors.HexColor("#D9E1F2")

styles = getSampleStyleSheet()
cell = ParagraphStyle("cell", parent=styles["Normal"], fontSize=6.3, leading=7.4)
cellc = ParagraphStyle("cellc", parent=cell, alignment=1)
cellb = ParagraphStyle("cellb", parent=cellc, fontName="Helvetica-Bold")
hcell = ParagraphStyle("hcell", parent=cell, textColor=colors.white,
                       fontName="Helvetica-Bold", alignment=1, fontSize=6.5, leading=7.6)

def P(t,s=cell): return Paragraph(str(t).replace("\n","<br/>"),s)

headers = ["Cliente","Unidade","Início\n(Planilha)","Início\n(Contrato)",
           "Fim\n(Planilha)","Fim (Contrato/Atual)","Últ. Reneg.\n(Planilha)",
           "Últ. Aditivo/Repact.\n(Contrato)","Próx. Reneg.\n(Planilha)",
           "Próx. Repact.\n(Correta)","Situação","Observações"]
colw = [108,92,52,92,52,104,60,98,60,92,50,238]

def overall(sts):
    if DIV in sts: return ("DIVERGENTE", C[DIV])
    if CONF in sts: return ("CONFERIR", C[CONF])
    if all(s==NA for s in sts): return ("N/A", C[NA])
    return ("OK", C[OK])

doc = SimpleDocTemplate("/home/user/Agenda/Validacao_Repactuacoes_Locacao.pdf",
        pagesize=landscape(A3), leftMargin=10*mm, rightMargin=10*mm,
        topMargin=10*mm, bottomMargin=10*mm)
story=[]
tt = ParagraphStyle("tt", parent=styles["Title"], fontSize=14, textColor=HDR, spaceAfter=2)
st = ParagraphStyle("st", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
lg = ParagraphStyle("lg", parent=styles["Normal"], fontSize=8)
sech = ParagraphStyle("sech", parent=styles["Normal"], fontSize=9.5,
        textColor=HDR, fontName="Helvetica-Bold", spaceBefore=6, spaceAfter=2)
story.append(Paragraph("VALIDAÇÃO DE REPACTUAÇÕES — Planilha de Locação (Consolidado) × Contratos/Aditivos (SharePoint)", tt))
story.append(Paragraph("Base: planilha 'Controle Contratos de Locação 2023-2026' (aba Consolidado) | Referência: 15/06/2026 | A planilha original NÃO foi alterada.", st))
story.append(Paragraph("Legenda: <font backColor='#C6EFCE'>&nbsp;VERDE = confere&nbsp;</font> &nbsp; <font backColor='#FFEB9C'>&nbsp;AMARELO = conferir / divergência leve&nbsp;</font> &nbsp; <font backColor='#FFC7CE'>&nbsp;VERMELHO = divergente (corrigir)&nbsp;</font>", lg))
story.append(Spacer(1,4))

hdr_row = [P(h,hcell) for h in headers]
for sec_name, rows in G.sections:
    data=[hdr_row]; styl=[
        ("BACKGROUND",(0,0),(-1,0),HDR),
        ("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#BFBFBF")),
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2),
        ("LEFTPADDING",(0,0),(-1,-1),3),("RIGHTPADDING",(0,0),(-1,-1),3),
    ]
    ri=1
    for row in rows:
        (cli,uni,p_ini,st_ini,c_ini,p_fim,st_fim,c_fim,
         p_ult,st_ult,c_ult,p_prox,st_prox,c_prox,obs)=row
        sit,sit_c = overall([st_ini,st_fim,st_ult,st_prox])
        data.append([P(cli),P(uni),P(p_ini,cellc),P(c_ini,cellc),P(p_fim,cellc),
                     P(c_fim,cellc),P(p_ult,cellc),P(c_ult,cellc),P(p_prox,cellc),
                     P(c_prox,cellc),P(sit,cellb),P(obs)])
        for col,sst in [(2,st_ini),(4,st_fim),(6,st_ult),(8,st_prox)]:
            if sst in C: styl.append(("BACKGROUND",(col,ri),(col,ri),C[sst]))
        styl.append(("BACKGROUND",(10,ri),(10,ri),sit_c))
        ri+=1
    t=Table(data,colWidths=colw,repeatRows=1); t.setStyle(TableStyle(styl))
    story.append(Paragraph("▎"+sec_name, sech))
    story.append(t)

# Resumo
story.append(Paragraph("RESUMO — Principais divergências a corrigir", tt))
rh=[P("#",hcell),P("Item / Unidade",hcell),P("O que corrigir",hcell)]
rdata=[rh]; rstyl=[("BACKGROUND",(0,0),(-1,0),HDR),
    ("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#BFBFBF")),
    ("VALIGN",(0,0),(-1,-1),"TOP"),
    ("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2)]
divs=[
 ("MS Consultoria – S402 (Ferreira Lima)","Fim 09/09/2026→09/09/2029 e próxima 09/09/2027→~03/03/2029 (2º aditivo de 03/03/2026 prorrogou 3 anos)."),
 ("Euqueroinvestir – Embasamento (Carl Hoepcke)","Fim 25/04/2026→30/04/2029 (2º aditivo de 16/03/2026 renovou por 3 anos)."),
 ("Shopping Deodoro","Fim 31/01/2025→28/02/2029 e preencher última (20/03/2026) e próxima (20/03/2029) — 7º aditivo de 20/03/2026."),
 ("Terreno Trompowsky","Fim 30/09/2025→30/04/2026 (2º aditivo); vigência já vencida em 30/04/2026 — verificar nova renovação."),
 ("Maxipark – Ferreira Lima","Fim 31/03/2010→'Indeterminado' (17º aditivo de 13/01/2025)."),
 ("Maxipark – Carl Hoepcke","Preencher última (30/01/2026) e próxima (30/01/2029) — 5º aditivo renovou até 31/12/2030."),
 ("Ieda Sena – S216 (Centro Emp. Floripa)","Fim 07/08/2023→'Indeterminado' (1º aditivo de 12/02/2025)."),
 ("Solon Sehn – S301 (Ferreira Lima)","Fim 31/01/2022→'Indeterminado' (6º aditivo de 18/03/2025)."),
 ("Intercorp – S101/201 (Ferreira Lima)","Fim 14/06/2022→'Indeterminado' (prazo original vencido; nenhum aditivo prorrogou)."),
 ("Vision Oftalmologia – S219 (Baía Sul)","Fim 31/01/2023→'Indeterminado' (6º aditivo de 27/02/2025)."),
 ("Clínica SOMA – S202 (Baía Sul)","Fim 12/09/2023 vencido — verificar renovação; provável prazo indeterminado."),
 ("Carlos Breda – S113 (Centro Emp. Floripa)","Fim 31/07/2025 vencido (vig. 14/07/2025, sem prorrogação); próxima 10/10/2027→10/12/2027."),
 ("Plaza Danúbio – AP102","Fim 07/05/2024 vencido→'Indeterminado' (sem aditivo de prorrogação)."),
 ("Costa & Advogados – S301 (Carl Hoepcke)","Fim 12/10/2025 vencido — verificar renovação."),
 ("AGAH/AMAX – S221 (Centro Emp. Floripa)","Contrato (até 30/11/2025) vencido — verificar renovação; ajustar nome p/ AGAH Creative House."),
 ("Marine – Apto 202 (Igor Dantas)","DISTRATADO em 22/05/2026 — atualizar como vago (planilha mostra ativo)."),
 ("Marine – Apto 304 (José Rafael)","Fim 31/01/2025→28/02/2027 (vigência real do contrato)."),
 ("Saint-Tropez – Apto 401 (Annalisa)","Fim 10/01/2027→10/01/2028 (10/01/2027 é só a data de saída antecipada sem multa)."),
 ("Banco Sofisa – S11 (Carl Hoepcke)","Datas são do locatário anterior (Strider); há novo contrato de 16/02/2026 — atualizar (PDF ilegível)."),
 ("Square Corporate – S330 (Resulta)","Linha sem datas — preencher início 26/03/2026 e fim 26/03/2027."),
 ("Bureau – S209 (Centro Emp. Floripa)","Fim 30/09/2023 vencido; confirmar última repactuação 26/05/2025 (aditivo não localizado)."),
 ("Galpão Cais do Porto (Petz)","Conferir início/fim: planilha 14/12/2021–14/12/2031 × aditivo 01/11/2021–31/10/2031."),
 ("Zenith / Orbis – Lojas 01 e 02 (Ferreira Lima)","Próxima 01/08/2028→30/08/2028 (3 anos do 9º/10º aditivo de 30/08/2025)."),
]
for i,(item,fix) in enumerate(divs,1):
    rdata.append([P(i,cellc),P(item,cellb),P(fix)])
rt=Table(rdata,colWidths=[24,235,520],repeatRows=1); rt.setStyle(TableStyle(rstyl))
story.append(Spacer(1,3)); story.append(rt)

doc.build(story)
print("PDF salvo: /home/user/Agenda/Validacao_Repactuacoes_Locacao.pdf")
