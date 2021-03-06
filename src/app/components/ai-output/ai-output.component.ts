import {Component, NgZone, OnDestroy, OnInit} from '@angular/core';
import {CarService} from '../../services/car-service/car.service';
import {SafeUrl} from '@angular/platform-browser';
import {Subject} from 'rxjs';
import {startWith, takeUntil} from 'rxjs/operators';

@Component({
  selector: 'caria-ai-output',
  templateUrl: './ai-output.component.html',
  styleUrls: ['./ai-output.component.scss']
})
export class AiOutputComponent implements OnInit, OnDestroy {
  constructor(private cariaService: CarService, private ngZone: NgZone) { }

  dataUrl: SafeUrl;

  private readonly unsubscribe$ = new Subject<void>();

  ngOnInit(): void {
    this.cariaService.currentOutput$.pipe(
      startWith('assets/placeholder.png'),
      takeUntil(this.unsubscribe$)
    ).subscribe(imageUrl => {
      this.ngZone.run(() => {
        this.dataUrl = imageUrl;
      });
    });
  }

  ngOnDestroy() {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }
}
