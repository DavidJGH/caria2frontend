import {AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild} from '@angular/core';
import {fromEvent, Subject} from 'rxjs';
import {pairwise, switchMap, take, takeUntil} from 'rxjs/operators';
import {CarService} from '../../../services/car-service/car.service';
import {CanvasService, Tool} from '../../../services/canvas-service/canvas.service';
import {rgbToHex} from '../../../util/caria.util';

@Component({
  selector: 'caria-canvas',
  template: '<canvas #canvas></canvas>',
  styles: ['canvas { box-shadow: 0 3px 7px 0 rgba(0, 0, 0, 0.15); display: flex;}']
})

export class CanvasComponent implements AfterViewInit, OnDestroy {

  downscaleWidthFactor: number = 2 * 1.1;

  private activeColor: string;

  constructor(
    private cariaService: CarService,
    private canvasService: CanvasService) {
    this.onResize();
  }

  @ViewChild('canvas') public canvas: ElementRef;

  public canvaselement;
  public width = window.innerWidth / this.downscaleWidthFactor;

  public height = this.width / 3;
  private cx: CanvasRenderingContext2D;

  private readonly unsubscribe$ = new Subject<void>();

  public currentTool = Tool.PENCIL;
  public currentImage: Blob;

  private startIndex: number;
  private currentIndex: number;

  private mouseDown: boolean;
  private drawnDot: boolean;
  private drawnDotPos: { x: number, y: number };

  @HostListener('window:resize', ['$event'])
  onResize() {
    const newWidth = window.innerWidth / this.downscaleWidthFactor;
    let lineWidthBefore;
    let lineCapBefore;
    let strokeStyleBefore;

    if (this.cx != null) {
      lineWidthBefore = this.cx.lineWidth;
      lineCapBefore = this.cx.lineCap;
      strokeStyleBefore = this.cx.strokeStyle;
    }

    this.width = Math.round(newWidth);
    this.height = Math.round(this.width / 3);

    if (this.canvaselement != null && this.cx != null) {
      this.canvaselement.width = this.width;
      this.canvaselement.height = this.height;

      this.cx.fillStyle = '#FFF';
      this.cx.fillRect(0, 0, this.width, this.height);
      this.setImageToCanvas();
      this.cx.lineWidth = lineWidthBefore;
      this.cx.lineCap = lineCapBefore;
      this.cx.strokeStyle = strokeStyleBefore;
    }
  }

  public ngAfterViewInit() {
    const canvasEl: HTMLCanvasElement = this.canvas.nativeElement;
    this.cx = canvasEl.getContext('2d');

    canvasEl.width = this.width;
    canvasEl.height = this.height;

    this.cx.lineCap = 'round';
    this.cx.strokeStyle = '#000';
    this.cx.fillStyle = '#FFF';
    this.cx.fillRect(0, 0, this.width, this.height);
    this.canvaselement = canvasEl;
    this.captureEvents(canvasEl);

    this.canvasService.currentStep$.pipe(
      take(1)
    ).subscribe(
      index => {
        this.startIndex = index;
        if (index < 0) {
          this.saveCurrentCanvasState();
        }
      }
    );

    this.canvasService.clearCanvas.pipe(takeUntil(this.unsubscribe$)).subscribe(() => this.clearCanvas());
    this.canvasService.currentStep$.pipe(takeUntil(this.unsubscribe$)).subscribe((index) => this.currentIndex = index);
    this.canvasService.activeColor$.pipe(takeUntil(this.unsubscribe$)).subscribe((color) => this.changeColor(color));
    this.canvasService.size$.pipe(takeUntil(this.unsubscribe$)).subscribe((size) => this.changeBrushSize(size));
    this.canvasService.activeImage$.pipe(takeUntil(this.unsubscribe$)).subscribe((image) => this.updateImage(image));
    this.canvasService.activeTool$.pipe(takeUntil(this.unsubscribe$)).subscribe((tool) => this.updateTool(tool));
  }

  private captureEvents(canvasEl: HTMLCanvasElement) {
    fromEvent(canvasEl, 'mousedown')
      .pipe(
        switchMap(() => {
          return fromEvent(canvasEl, 'mousemove')
            .pipe(
              takeUntil(fromEvent(canvasEl, 'mouseup')),
              takeUntil(fromEvent(canvasEl, 'mouseleave')),
              pairwise(),
            );
        })
      )
      .subscribe((res: [MouseEvent, MouseEvent]) => {
        const rect = canvasEl.getBoundingClientRect();

        const prevPos = {
          x: res[0].clientX - rect.left,
          y: res[0].clientY - rect.top
        };

        const currentPos = {
          x: res[1].clientX - rect.left,
          y: res[1].clientY - rect.top
        };
        if (this.currentTool === Tool.ERASER)
        {
          this.cx.strokeStyle = '#FFF';
          this.drawOnCanvas(prevPos, currentPos);
          if (this.drawnDot){
            this.drawOnCanvas(this.drawnDotPos, prevPos);
            this.drawnDot = false;
          }
        }
        else if (this.currentTool === Tool.PENCIL){
          this.cx.strokeStyle = this.activeColor;
          this.drawOnCanvas(prevPos, currentPos);
          if (this.drawnDot){
            this.drawOnCanvas(this.drawnDotPos, prevPos);
            this.drawnDot = false;
          }
        }
      });
    fromEvent(canvasEl, 'mouseup').subscribe(() => {
      this.saveCurrentCanvasState();
      this.mouseDown = false;
    });
    fromEvent(canvasEl, 'mouseleave').subscribe(() => {
      if (this.mouseDown){
        this.saveCurrentCanvasState();
        this.mouseDown = false;
      }
    });
    fromEvent(canvasEl, 'mousedown').subscribe((res: MouseEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      const position = {
        x: res.clientX - rect.left,
        y: res.clientY - rect.top
      };
      if (this.currentTool === Tool.ERASER)
      {
        this.cx.strokeStyle = '#FFF';
        this.drawPointOnCanvas(position);
        this.drawnDot = true;
        this.drawnDotPos = position;
        this.mouseDown = true;
      }
      else if (this.currentTool === Tool.PENCIL){
        this.cx.strokeStyle = this.activeColor;
        this.drawPointOnCanvas(position);
        this.drawnDot = true;
        this.drawnDotPos = position;
        this.mouseDown = true;
      }
      else if (this.currentTool === Tool.PICKER) {
        const pixel = this.cx.getImageData(position.x, position.y, 1, 1);
        const data = pixel.data;
        this.canvasService.updateColor(rgbToHex(data[0], data[1], data[2]));
        this.canvasService.updateActiveTool(Tool.PENCIL);
      }
    });
  }

  private drawPointOnCanvas(position: { x: number, y: number }){
    if (!this.cx){
      return;
    }

    this.cx.beginPath();

    if (position){
      this.cx.moveTo(position.x, position.y);
      this.cx.lineTo(position.x, position.y);
      this.cx.stroke();
    }
  }

  private drawOnCanvas(prevPos: { x: number, y: number }, currentPos: { x: number, y: number }) {
    if (!this.cx) {
      return;
    }

    this.cx.beginPath();

    if (prevPos) {
      this.cx.moveTo(prevPos.x, prevPos.y);
      this.cx.lineTo(currentPos.x, currentPos.y);
      this.cx.stroke();
    }
  }

  public clearCanvas() {
    this.cx.fillRect(0, 0, this.width, this.height);
    this.saveCurrentCanvasState();
  }

  public changeColor(colorCodeString: string) {
    this.activeColor = colorCodeString;
    this.cx.strokeStyle = this.activeColor;
  }

  public changeBrushSize(brushSize: number) {
    this.cx.lineWidth = brushSize;
  }

  public updateOutput() {
    if (this.currentIndex !== this.startIndex && this.currentIndex > 0) {
      this.cariaService.updateValuesFromImage(this.currentImage);
    }
  }

  public saveCurrentCanvasState() {
    this.canvaselement.toBlob(blob => {
      this.canvasService.updateImage(blob);
    });
  }

  public updateImage(image: Blob) {
    this.currentImage = image;
    this.setImageToCanvas();
    this.updateOutput();
  }

  private setImageToCanvas() {
    createImageBitmap(this.currentImage).then(renderer =>
      this.cx.drawImage(renderer, 0, 0, this.width, this.height)
    );
  }

  private updateTool(tool: Tool) {
    this.currentTool = tool;
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
